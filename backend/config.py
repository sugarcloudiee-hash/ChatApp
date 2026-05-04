"""
Application configuration management.
"""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Application
APP_SECRET = os.environ.get("CHAT_KEY", "").strip() or secrets.token_urlsafe(32)
DEBUG_MODE = os.environ.get("FLASK_DEBUG", "0") == "1"
PORT = int(os.environ.get("PORT", 5050))

# Database
DB_PATH = BASE_DIR / "data.db"
DATABASE_URI = (
    os.environ.get("DATABASE_URL", "").strip()
    or os.environ.get("SUPABASE_URL", "").strip()
    or f"sqlite:///{DB_PATH}"
)

# Supabase Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in .env file\n"
        "Get these from your Supabase project settings."
    )

# Redis (Optional)
REDIS_URL = os.environ.get("REDIS_URL", "").strip()

# Upload Configuration
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif",
    "mp4", "webm", "ogg",
    "mp3", "wav", "aac", "m4a",
    "pdf", "txt", "srt", "vtt"
}

ALLOWED_MIME_TYPES = {
    "image/png", "image/jpeg", "image/jpg", "image/gif",
    "video/mp4", "video/webm", "video/ogg",
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/ogg", "audio/webm", "audio/aac", "audio/mp4", "audio/x-m4a",
    "application/pdf",
    "text/plain",
    "application/x-subrip",  # .srt
    "text/vtt"  # .vtt
}

# Rate Limiting
MESSAGE_RATE_LIMIT_COUNT = int(os.environ.get("MESSAGE_RATE_LIMIT_COUNT", "10"))
MESSAGE_RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("MESSAGE_RATE_LIMIT_WINDOW_SECONDS", "5"))

# Room Configuration
MAX_ROOM_MEMBERS = 2  # 2-person rooms
MAX_ACTIVE_CONNECTIONS = int(os.environ.get("MAX_ACTIVE_CONNECTIONS", "100"))

# CORS Origins
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5050",
    "http://127.0.0.1:5050"
]

if os.environ.get("CORS_ORIGINS"):
    CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS").split(",")]