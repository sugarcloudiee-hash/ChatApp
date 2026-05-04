"""
Flask extensions initialization.
"""
import logging
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from itsdangerous import URLSafeTimedSerializer
from supabase import create_client

from backend.config import (
    SUPABASE_URL, 
    SUPABASE_SERVICE_ROLE_KEY, 
    REDIS_URL, 
    CORS_ORIGINS,
    DEBUG_MODE
)

logger = logging.getLogger(__name__)

# Initialize extensions
db = SQLAlchemy()

socketio = SocketIO(
    cors_allowed_origins=CORS_ORIGINS,
    manage_session=False,
    ping_timeout=60,
    ping_interval=25,
    async_mode='gevent',  # Explicitly use gevent for production
    # Enable detailed packet logs only in debug mode; packet payloads may contain tokens.
    logger=DEBUG_MODE,
    engineio_logger=DEBUG_MODE
)

# Security serializer for tokens
serializer = None

# Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
logger.info("Supabase client initialized")

# Redis client (optional)
redis_client = None

def init_extensions(app):
    """Initialize all Flask extensions."""
    global serializer, redis_client
    
    # Initialize database
    db.init_app(app)
    logger.info("Database initialized")
    
    # Initialize Socket.IO
    socketio.init_app(app)
    logger.info("Socket.IO initialized")
    
    # Initialize serializer for secure tokens
    serializer = URLSafeTimedSerializer(
        app.config["SECRET_KEY"], 
        salt="file-download"
    )
    
    # Initialize Redis if available
    if REDIS_URL:
        try:
            import redis
            redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
            redis_client.ping()
            logger.info("Redis connection established")
        except Exception as exc:
            logger.warning(f"Redis unavailable, continuing without it: {exc}")