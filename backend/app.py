import eventlet
eventlet.monkey_patch()

import os
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, disconnect, emit
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = (BASE_DIR / ".." / "frontend").resolve()
UPLOAD_DIR = (BASE_DIR / "uploads").resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Security (simple shared secret + single active session)
# Set CHAT_KEY to a long random string (recommended for any public URL).
CHAT_KEY = os.environ.get("CHAT_KEY", "").strip()
# How many concurrent connected clients are allowed.
# For your requirement ("only one login can be made"), keep this at 1.
MAX_ACTIVE_CONNECTIONS = int(os.environ.get("MAX_ACTIVE_CONNECTIONS", "1").strip() or "1")
if MAX_ACTIVE_CONNECTIONS < 1:
    MAX_ACTIVE_CONNECTIONS = 1
ACTIVE_SIDS: set[str] = set()


app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="",
)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB

socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory storage (last 50 messages)
MESSAGES = []


def _utc_timestamp() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _append_message(msg: dict) -> dict:
    MESSAGES.append(msg)
    if len(MESSAGES) > 50:
        del MESSAGES[:-50]
    return msg


def _extract_key() -> str:
    return (request.headers.get("X-Chat-Key") or request.args.get("key") or "").strip()


def _authorized(key: str) -> bool:
    if not CHAT_KEY:
        return True
    return key == CHAT_KEY


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/style.css")
def style():
    return send_from_directory(app.static_folder, "style.css")


@app.get("/script.js")
def script():
    return send_from_directory(app.static_folder, "script.js")


@app.get("/uploads/<path:filename>")
def uploads(filename: str):
    return send_from_directory(str(UPLOAD_DIR), filename)


@app.post("/upload")
def upload():
    if not _authorized(_extract_key()):
        return jsonify({"error": "Unauthorized"}), 401

    if "file" not in request.files:
        return jsonify({"error": "Missing file field 'file'"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    original_name = secure_filename(f.filename)
    ext = Path(original_name).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOAD_DIR / unique_name
    f.save(save_path)

    return jsonify(
        {
            "file_url": f"/uploads/{unique_name}",
            "original_name": original_name,
        }
    )


@socketio.on("connect")
def on_connect(auth=None):
    key = ""
    if isinstance(auth, dict):
        key = str(auth.get("key") or "").strip()
    if not key:
        key = (request.args.get("key") or "").strip()

    if not _authorized(key):
        return False

    if len(ACTIVE_SIDS) >= MAX_ACTIVE_CONNECTIONS:
        return False

    ACTIVE_SIDS.add(request.sid)
    emit("message_history", MESSAGES)


@socketio.on("disconnect")
def on_disconnect():
    ACTIVE_SIDS.discard(request.sid)


@socketio.on("send_message")
def on_send_message(data):
    sender = (data or {}).get("sender", "").strip()
    message = (data or {}).get("message", "")
    msg_type = (data or {}).get("type", "text")
    file_url = (data or {}).get("file_url")

    if not sender:
        return

    if CHAT_KEY:
        key = str((data or {}).get("key") or "").strip()
        if key != CHAT_KEY:
            disconnect()
            return

    msg_obj = {
        "sender": sender,
        "message": message,
        "type": msg_type,
        "file_url": file_url,
        "timestamp": _utc_timestamp(),
    }

    _append_message(msg_obj)
    emit("receive_message", msg_obj, broadcast=True)


if __name__ == "__main__":
    # Disable debug/reloader to avoid unexpected restarts when run publicly.
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, use_reloader=False)
