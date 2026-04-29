import logging

from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from itsdangerous import URLSafeTimedSerializer
from supabase import create_client
try:
    import redis
except Exception:  # pragma: no cover
    redis = None

from backend.config import CORS_ORIGINS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL


db = SQLAlchemy()


def _socketio_cors_origins():
    if CORS_ORIGINS == ["*"]:
        return "*"
    return CORS_ORIGINS


socketio = SocketIO(
    cors_allowed_origins=_socketio_cors_origins(),
    manage_session=False,
    ping_timeout=60,
    ping_interval=25,
    # Allow selecting eventlet/gevent/threading via environment when needed.
    async_mode=None,
    message_queue=REDIS_URL or None,
)

serializer = None
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
redis_client = None

logger = logging.getLogger(__name__)


def init_extensions(app):
    global serializer, redis_client
    db.init_app(app)
    socketio.init_app(app)
    serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="file-download")

    if REDIS_URL:
        if redis is None:
            logger.warning("REDIS_URL is set but redis package is not installed.")
            return
        try:
            redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
            redis_client.ping()
            logger.info("Redis connection established.")
        except Exception as exc:
            redis_client = None
            logger.warning(f"Redis unavailable, continuing without it: {exc}")