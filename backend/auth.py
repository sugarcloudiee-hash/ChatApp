from flask import g, jsonify, request
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from extensions import db, supabase
from models import User, Session
from utils import _extract_access_token


def _extract_supabase_user_record(user_response) -> dict:
    if isinstance(user_response, dict):
        user = user_response.get("user") or user_response.get("data") or user_response
    else:
        user = getattr(user_response, "user", None) or getattr(user_response, "data", None) or user_response

    if hasattr(user, "model_dump"):
        user = user.model_dump()
    elif not isinstance(user, dict) and hasattr(user, "__dict__"):
        user = dict(user.__dict__)

    return user if isinstance(user, dict) else {}


def _profile_from_supabase_user(user_data: dict, fallback_identifier: str = "") -> dict:
    email = str(user_data.get("email") or fallback_identifier or "").strip().lower()
    metadata = user_data.get("user_metadata") or {}
    display_name = str(metadata.get("full_name") or metadata.get("name") or metadata.get("display_name") or email.split("@")[0] or fallback_identifier or email).strip()
    avatar = "".join([part[0] for part in display_name.split()[:2]]).upper() or email[:2].upper() or "?"
    return {
        "username": email,
        "email": email,
        "display_name": display_name,
        "avatar": avatar,
    }


def _upsert_local_user(profile: dict) -> User:
    email = str(profile.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Missing email for user sync")

    user = User.query.filter(func.lower(User.email) == email).first()
    if user:
        user.username = profile.get("username") or email
        user.display_name = profile.get("display_name") or user.display_name
        user.avatar = profile.get("avatar") or user.avatar
    else:
        user = User(
            username=profile.get("username") or email,
            email=email,
            display_name=profile.get("display_name") or email.split("@")[0],
            avatar=profile.get("avatar") or email[:2].upper(),
        )
        db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        user = User.query.filter(func.lower(User.email) == email).first()
        if user:
            user.username = profile.get("username") or email
            user.display_name = profile.get("display_name") or user.display_name
            user.avatar = profile.get("avatar") or user.avatar
            db.session.commit()
            return user
        raise

    return user


def _upsert_supabase_user(profile: dict) -> None:
    try:
        supabase.table("users").upsert(profile, on_conflict="email").execute()
    except Exception:
        pass


def _find_supabase_user_by_identifier(identifier: str) -> dict:
    target = str(identifier or "").strip().lower()
    if not target:
        return {}

    try:
        if hasattr(supabase, "table"):
            for field in ("email", "username", "display_name"):
                try:
                    response = supabase.table("users").select("*").eq(field, target).limit(1).execute()
                    data = getattr(response, "data", None) or (response.get("data") if isinstance(response, dict) else None)
                    if data:
                        record = data[0]
                        if isinstance(record, dict):
                            return record
                except Exception:
                    continue
    except Exception:
        pass

    admin = getattr(getattr(supabase, "auth", None), "admin", None)
    if not admin:
        return {}

    page = 1
    while page <= 10:
        try:
            response = admin.list_users(page=page, per_page=100)
        except TypeError:
            response = admin.list_users()
        except Exception:
            break

        payload = response if isinstance(response, dict) else getattr(response, "__dict__", {})
        users = payload.get("users") or payload.get("data") or []
        if not users:
            break

        for raw_user in users:
            user_data = _extract_supabase_user_record(raw_user)
            email = str(user_data.get("email") or "").strip().lower()
            metadata = user_data.get("user_metadata") or {}
            display_name = str(metadata.get("full_name") or metadata.get("name") or metadata.get("display_name") or "").strip().lower()
            metadata_username = str(metadata.get("username") or "").strip().lower()
            if target in {email, display_name, metadata_username}:
                return user_data

        page += 1

    return {}


def find_or_sync_user_by_identifier(identifier: str):
    target = str(identifier or "").strip()
    if not target:
        return None

    lowered = target.lower()
    local_user = User.query.filter(
        or_(
            func.lower(User.username) == lowered,
            func.lower(User.email) == lowered,
            func.lower(User.display_name) == lowered,
        )
    ).first()
    if local_user:
        return local_user

    user_data = _find_supabase_user_by_identifier(target)
    if not user_data:
        return None

    profile = _profile_from_supabase_user(user_data, fallback_identifier=target)
    _upsert_supabase_user(profile)
    return _upsert_local_user(profile)


def _verify_supabase_token(token: str) -> dict:
    if not token:
        raise ValueError("Missing Supabase auth token")

    try:
        if hasattr(supabase.auth, "get_user"):
            user_response = supabase.auth.get_user(token)
        else:
            user_response = supabase.auth.api.get_user(token)
    except Exception as exc:
        raise ValueError(f"Invalid Supabase auth token: {exc}") from exc

    if isinstance(user_response, dict):
        user = user_response.get("user") or user_response.get("data")
        error = user_response.get("error")
    else:
        user = getattr(user_response, "user", None) or getattr(user_response, "data", None) or user_response
        error = getattr(user_response, "error", None)

    if hasattr(user, "model_dump"):
        user = user.model_dump()
    elif not isinstance(user, dict) and hasattr(user, "__dict__"):
        user = dict(user.__dict__)

    if error:
        raise ValueError(f"Invalid Supabase auth token: {error}")
    if not user or not user.get("email"):
        raise ValueError("Invalid Supabase user")
    return user


def _get_user_from_supabase(token: str):
    user_data = _verify_supabase_token(token)
    profile = _profile_from_supabase_user(user_data)
    if not profile.get("email"):
        raise ValueError("Supabase auth user missing email")

    _upsert_supabase_user(profile)
    return _upsert_local_user(profile)


def _current_user(token: str | None = None):
    if getattr(g, "current_user", None):
        return g.current_user

    if token is None:
        token = _extract_access_token()

    user = _get_user_from_supabase(token)
    g.current_user = user
    return user


def register_auth(app):
    @app.before_request
    def require_auth():
        public_paths = {
            "/",
            "/favicon.ico",
            "/favicon.svg",
            "/legacy.html",
            "/index.html",
            "/style.css",
            "/script.js",
        }
        public_prefixes = (
            "/assets/",
            "/download/",
            "/socket.io",
        )

        if request.method == "OPTIONS":
            return None

        if request.path in public_paths:
            return None

        if request.path.startswith(public_prefixes):
            return None

        try:
            _current_user()
        except Exception as exc:
            app.logger.warning(f"Unauthorized request: {str(exc)}")
            return jsonify({"error": "Unauthorized"}), 401
