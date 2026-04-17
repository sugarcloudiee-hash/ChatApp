from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from itsdangerous import URLSafeTimedSerializer
from supabase import create_client

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


db = SQLAlchemy()
socketio = SocketIO(
    cors_allowed_origins="*",
    manage_session=False,
    ping_timeout=60,
    ping_interval=25,
    async_mode="threading",
)
serializer = None
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def init_extensions(app):
    global serializer
    db.init_app(app)
    socketio.init_app(app)
    serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="file-download")
