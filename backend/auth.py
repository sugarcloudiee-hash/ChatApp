"""
Authentication module using Supabase JWT tokens.
"""
import time
import logging
from threading import Lock

from flask import g, jsonify, request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from backend.extensions import db, supabase
from backend.models import User

logger = logging.getLogger(__name__)

# Token verification cache
_TOKEN_CACHE_LOCK = Lock()
_TOKEN_CACHE: dict[str, tuple[float, dict]] = {}
_TOKEN_CACHE_TTL_SECONDS = 60


def _profile_from_supabase_user(user_data: dict, fallback_identifier: str = "") -> dict:
    """Extract user profile from Supabase user data."""
    email = str(user_data.get("email") or fallback_identifier or "").strip().lower()
    metadata = user_data.get("user_metadata") or {}
    
    display_name = str(
        metadata.get("full_name") 
        or metadata.get("display_name")
        or metadata.get("name") 
        or email.split("@")[0] 
        or "User"
    ).strip()
    
    # Generate avatar from initials
    avatar = "".join([part[0] for part in display_name.split()[:2]]).upper()[:2]
    if not avatar:
        avatar = email[:2].upper() or "?"
    
    return {
        "username": email,
        "email": email,
        "display_name": display_name,
        "avatar": avatar,
    }


def _upsert_local_user(profile: dict) -> User:
    """Create or update local user record."""
    email = str(profile.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Missing email for user sync")

    user = User.query.filter(func.lower(User.email) == email).first()
    
    if user:
        # Update existing user
        user.display_name = profile.get("display_name") or user.display_name
        user.avatar = profile.get("avatar") or user.avatar
        user.last_seen = __import__('datetime').datetime.utcnow()
    else:
        # Create new user
        user = User(
            username=profile.get("username") or email,
            email=email,
            display_name=profile["display_name"],
            avatar=profile["avatar"],
        )
        db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        user = User.query.filter(func.lower(User.email) == email).first()
        if not user:
            raise
        user.display_name = profile.get("display_name") or user.display_name
        user.avatar = profile.get("avatar") or user.avatar
        db.session.commit()

    return user


def _verify_supabase_token(token: str) -> dict:
    """Verify Supabase JWT token with caching."""
    if not token:
        raise ValueError("Missing Supabase auth token")

    now = time.time()
    
    # Check cache first
    with _TOKEN_CACHE_LOCK:
        cached = _TOKEN_CACHE.get(token)
        if cached and cached[0] > now:
            return cached[1]

    try:
        user_response = supabase.auth.get_user(token)
    except Exception as exc:
        logger.error(f"Token verification failed: {exc}")
        raise ValueError(f"Invalid Supabase auth token") from exc

    if hasattr(user_response, 'user'):
        user = user_response.user.model_dump()
    elif isinstance(user_response, dict):
        user = user_response.get('user', {})
    else:
        raise ValueError("Unexpected response format from Supabase")

    if not user or not user.get("email"):
        raise ValueError("Invalid Supabase user")

    # Cache the result
    with _TOKEN_CACHE_LOCK:
        _TOKEN_CACHE[token] = (time.time() + _TOKEN_CACHE_TTL_SECONDS, user)

    return user


def _current_user(token: str | None = None):
    """Get or verify current user from JWT token."""
    if getattr(g, "current_user", None):
        return g.current_user

    if token is None:
        # Extract token from request
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        else:
            token = request.args.get("access_token", "").strip()
            if not token:
                token = request.args.get("token", "").strip()

    if not token:
        raise ValueError("No authentication token provided")

    user_data = _verify_supabase_token(token)
    profile = _profile_from_supabase_user(user_data)
    user = _upsert_local_user(profile)
    
    g.current_user = user
    return user


def register_auth(app):
    """Register authentication middleware."""
    
    @app.before_request
    def require_auth():
        """Authenticate all API requests except public endpoints."""
        public_paths = {
            "/",
            "/favicon.ico",
            "/api/health",
        }
        public_prefixes = (
            "/socket.io",
            "/.well-known/",
        )

        if request.method == "OPTIONS":
            return None

        if request.path in public_paths:
            return None

        if request.path.startswith(public_prefixes):
            return None

        # Skip auth for API config endpoint
        if request.path == "/api/config":
            return None

        try:
            _current_user()
        except Exception as exc:
            logger.warning(f"Unauthorized request to {request.path}: {str(exc)}")
            return jsonify({"error": "Unauthorized"}), 401