import os
import secrets
import socket
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_SRC_DIR = (BASE_DIR / ".." / "frontend").resolve()
FRONTEND_DIST_DIR = (FRONTEND_SRC_DIR / "dist").resolve()
UPLOAD_DIR = (BASE_DIR / "uploads").resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(BASE_DIR / ".env")
load_dotenv((BASE_DIR / ".." / "frontend" / ".env"), override=False)

APP_SECRET = os.environ.get("CHAT_KEY", "").strip() or secrets.token_urlsafe(32)
DEBUG_MODE = os.environ.get("FLASK_DEBUG") == "1" or os.environ.get("DEBUG") == "1"

if FRONTEND_DIST_DIR.exists():
    FRONTEND_DIR = FRONTEND_DIST_DIR
elif DEBUG_MODE:
    FRONTEND_DIR = FRONTEND_SRC_DIR
else:
    raise RuntimeError(
        "frontend/dist is missing. Build the frontend before deployment (cd frontend && npm ci && npm run build)."
    )

DB_PATH = BASE_DIR / "data.db"
DATABASE_URI = (
    os.environ.get("DATABASE_URL", "").strip()
    or os.environ.get("SUPABASE_POSTGRES_URL", "").strip()
    or f"sqlite:///{DB_PATH}"
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured")

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/ogg",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a",
    "application/pdf",
    "text/plain",
}

ALLOWED_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "gif",
    "mp4",
    "webm",
    "ogg",
    "mp3",
    "wav",
    "aac",
    "m4a",
    "pdf",
    "txt",
}

MAX_ACTIVE_CONNECTIONS = int(os.environ.get("MAX_ACTIVE_CONNECTIONS", "2").strip() or "2")
if MAX_ACTIVE_CONNECTIONS < 1:
    MAX_ACTIVE_CONNECTIONS = 1


def _default_local_origins():
    origins = [
        "http://localhost:5050",
        "http://127.0.0.1:5050",
        "https://dimension-pilot-seeds-lit.trycloudflare.com",
    ]
    try:
        host = socket.gethostname()
        for ip in socket.gethostbyname_ex(host)[2]:
            if ip and not ip.startswith("127."):
                origins.append(f"http://{ip}:5050")
    except OSError:
        pass
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
        if local_ip and not local_ip.startswith("127."):
            origins.append(f"http://{local_ip}:5050")
    except OSError:
        pass
    return sorted(set(origins))


def _resolve_cors_origins():
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    if DEBUG_MODE:
        return ["*"]
    return _default_local_origins()


CORS_ORIGINS = _resolve_cors_origins()
