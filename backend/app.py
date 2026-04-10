# No async middleware needed - use simple threading mode
import os
import secrets
import socket
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, disconnect, emit, join_room
from itsdangerous import BadData, URLSafeTimedSerializer
from werkzeug.utils import secure_filename

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.info("Backend application starting up...")

# Enable Socket.IO logging
socketio_logger = logging.getLogger('socketio')
socketio_logger.setLevel(logging.DEBUG)
engineio_logger = logging.getLogger('engineio')
engineio_logger.setLevel(logging.DEBUG)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = (BASE_DIR / ".." / "frontend").resolve()
UPLOAD_DIR = (BASE_DIR / "uploads").resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

APP_SECRET = os.environ.get("CHAT_KEY", "").strip() or secrets.token_urlsafe(32)
DEBUG_MODE = os.environ.get("FLASK_DEBUG") == "1" or os.environ.get("DEBUG") == "1"

DB_PATH = BASE_DIR / "data.db"
DATABASE_URI = f"sqlite:///{DB_PATH}"

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/ogg",
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
    "pdf",
    "txt",
}

MAX_ACTIVE_CONNECTIONS = int(os.environ.get("MAX_ACTIVE_CONNECTIONS", "2").strip() or "2")
if MAX_ACTIVE_CONNECTIONS < 1:
    MAX_ACTIVE_CONNECTIONS = 1

def _default_local_origins():
    origins = [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "https://dimension-pilot-seeds-lit.trycloudflare.com",
    ]
    try:
        host = socket.gethostname()
        for ip in socket.gethostbyname_ex(host)[2]:
            if ip and not ip.startswith("127."):
                origins.append(f"http://{ip}:5000")
    except OSError:
        pass
    try:
        # also include the interface address if available
        local_ip = socket.gethostbyname(socket.gethostname())
        if local_ip and not local_ip.startswith("127."):
            origins.append(f"http://{local_ip}:5000")
    except OSError:
        pass
    return sorted(set(origins))

default_origins = _default_local_origins()
raw_cors_origins = os.environ.get("CORS_ORIGINS", "").strip()
if raw_cors_origins:
    CORS_ORIGINS = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]
elif DEBUG_MODE:
    CORS_ORIGINS = ["*"]
else:
    CORS_ORIGINS = default_origins

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="",
)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URI
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB
app.config["SECRET_KEY"] = APP_SECRET or secrets.token_urlsafe(32)
app.config["JSON_SORT_KEYS"] = False

socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*", manage_session=False, ping_timeout=60, ping_interval=25)

# Log all incoming requests
@app.before_request
def log_request_info():
    logger.debug(f">>> REQUEST: {request.method} {request.path}")
    logger.debug(f"    From: {request.remote_addr}")
    if request.args:
        logger.debug(f"    Query: {dict(request.args)}")
    if request.form:
        logger.debug(f"    Form: {dict(request.form)}")

db = SQLAlchemy(app)
serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="file-download")

ROOM_HOSTS: dict[str, str] = {}  # room_key -> host_username
ROOM_MEMBERS: dict[str, dict[str, dict]] = {}  # room_key -> {username: member_info}
ROOM_PENDING: dict[str, set[str]] = {}  # room_key -> {username}  (awaiting approval)
ROOM_TYPING: dict[str, set[str]] = {}
SID_ROOM: dict[str, str] = {}  # sid -> room_key
SID_USERNAME: dict[str, str] = {}  # sid -> username


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    display_name = db.Column(db.String(128), nullable=False)
    avatar = db.Column(db.String(32), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sessions = db.relationship("Session", backref="user", lazy=True)

    def to_dict(self):
        return {
            "username": self.username,
            "display_name": self.display_name,
            "avatar": self.avatar,
        }


class Session(db.Model):
    token = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)

    def is_valid(self) -> bool:
        return self.expires_at is None or self.expires_at > datetime.utcnow()


class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_key = db.Column(db.String(64), unique=True, nullable=False, index=True)
    host_username = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    locked = db.Column(db.Boolean, default=False)
    max_members = db.Column(db.Integer, default=10)


class Message(db.Model):
    id = db.Column(db.String(32), primary_key=True)
    room_key = db.Column(db.String(64), nullable=False, index=True)
    sender_username = db.Column(db.String(64), nullable=False)
    display_name = db.Column(db.String(128), nullable=False)
    avatar = db.Column(db.String(32), nullable=False)
    message = db.Column(db.Text, default="")
    type = db.Column(db.String(16), default="text")
    file_url = db.Column(db.String(256), nullable=True)
    timestamp = db.Column(db.String(32), nullable=False)
    edited = db.Column(db.Boolean, default=False)
    deleted = db.Column(db.Boolean, default=False)
    reactions = db.Column(db.JSON, nullable=False, default=dict)
    reads = db.Column(db.JSON, nullable=False, default=dict)

    def to_dict(self):
        return {
            "id": self.id,
            "sender": self.sender_username,
            "display_name": self.display_name,
            "avatar": self.avatar,
            "message": self.message,
            "type": self.type,
            "file_url": self.file_url,
            "timestamp": self.timestamp,
            "edited": self.edited,
            "deleted": self.deleted,
            "reactions": self.reactions or {},
            "reads": self.reads or {},
        }


with app.app_context():
    db.create_all()


def _utc_timestamp() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _allowed_file(filename: str, mimetype: str) -> bool:
    ext = Path(filename).suffix.lower().lstrip(".")
    return ext in ALLOWED_EXTENSIONS and mimetype in ALLOWED_MIME_TYPES


def _make_file_token(filename: str) -> str:
    return serializer.dumps({"name": filename})


def _verify_file_token(token: str, max_age: int = 60 * 60 * 4) -> str:
    data = serializer.loads(token, max_age=max_age)
    return str(data["name"])


def _extract_room_key() -> str:
    return (request.headers.get("X-Room-Key") or request.args.get("room_key") or "").strip()


def _extract_session_token() -> str:
    return (request.headers.get("X-Session-Token") or request.args.get("session_token") or "").strip()


# Global error handlers
@app.errorhandler(400)
def handle_bad_request(e):
    logger.error(f"400 Bad Request: {str(e)}")
    logger.error(f"  Path: {request.path}")
    logger.error(f"  Method: {request.method}")
    logger.error(f"  Args: {dict(request.args)}")
    return {"error": str(e)}, 400

@app.errorhandler(500)
def handle_server_error(e):
    logger.error(f"500 Server Error: {str(e)}", exc_info=True)
    return {"error": "Internal Server Error"}, 500

def _get_session(token: str):
    if not token:
        return None
    return Session.query.filter_by(token=token).first()


def _get_or_create_user(username: str, display_name: str, avatar: str):
    user = User.query.filter_by(username=username).first()
    if user:
        if user.display_name != display_name:
            user.display_name = display_name
        if user.avatar != avatar:
            user.avatar = avatar
        db.session.commit()
        return user

    user = User(username=username, display_name=display_name, avatar=avatar)
    db.session.add(user)
    db.session.commit()
    return user


def _create_session(user: User):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=14)
    session = Session(token=token, user_id=user.id, expires_at=expires_at)
    db.session.add(session)
    db.session.commit()
    return session


def _get_room_messages(room_key: str) -> list[dict]:
    messages = (
        Message.query.filter_by(room_key=room_key)
        .order_by(Message.timestamp.desc())
        .limit(50)
        .all()
    )
    return [message.to_dict() for message in reversed(messages)]


def _get_member(room: str, username: str) -> dict | None:
    return ROOM_MEMBERS.get(room, {}).get(username)


def _present_members(room: str) -> list[dict]:
    return list(ROOM_MEMBERS.get(room, {}).values())


def _find_message(room_key: str, message_id: str):
    return Message.query.filter_by(room_key=room_key, id=message_id).first()


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/style.css")
def style():
    return send_from_directory(app.static_folder, "style.css")


@app.get("/script.js")
def script():
    return send_from_directory(app.static_folder, "script.js")


@app.post("/session")
def create_session():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    display_name = str(data.get("display_name") or username).strip() or username
    if not username:
        return jsonify({"error": "Missing username"}), 400

    avatar = "".join([part[0] for part in display_name.split()[:2]]).upper() or username[:2].upper()
    user = _get_or_create_user(username, display_name, avatar)
    session = _create_session(user)

    return jsonify({"token": session.token, "user": user.to_dict()}), 201


@app.post("/upload")
def upload():
    session_token = _extract_session_token()
    session = _get_session(session_token)
    if not session or not session.is_valid():
        return jsonify({"error": "Unauthorized"}), 401

    room_key = _extract_room_key()
    if not room_key:
        return jsonify({"error": "Missing room invite key"}), 400

    if "file" not in request.files:
        return jsonify({"error": "Missing file field 'file'"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    original_name = secure_filename(f.filename)
    if not _allowed_file(original_name, f.mimetype):
        return jsonify({"error": "File type not allowed"}), 400

    ext = Path(original_name).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOAD_DIR / unique_name
    f.save(save_path)

    token = _make_file_token(unique_name)
    return jsonify(
        {
            "file_url": f"/download/{token}",
            "original_name": original_name,
        }
    )


@app.get("/download/<token>")
def download(token: str):
    try:
        filename = _verify_file_token(token)
    except BadData:
        return jsonify({"error": "Invalid or expired download token"}), 403

    return send_from_directory(str(UPLOAD_DIR), filename, as_attachment=True)


@socketio.on("connect")
def on_connect(auth=None):
    logger.debug(f"=== Socket.IO CONNECT handler called ===")
    logger.debug(f"Auth data received: {auth}")
    logger.debug(f"Request SID: {request.sid}")
    
    try:
        if not isinstance(auth, dict):
            auth = {}

        session_token = str(auth.get("session_token") or request.args.get("session_token") or "").strip()
        room_key = str(auth.get("room_key") or request.args.get("room_key") or "").strip()
        logger.debug(f"Session token: {session_token[:20] if session_token else 'EMPTY'}..., Room key: {room_key}")
        
        session = _get_session(session_token)
        logger.debug(f"Session lookup result: {session is not None}, Valid: {session.is_valid() if session else False}")

        if not session or not session.is_valid() or not room_key:
            logger.warning(f"=== Connection REJECTED ===")
            logger.warning(f"  Session valid: {session and session.is_valid()}")
            logger.warning(f"  Room key present: {bool(room_key)}")
            return False
        
        logger.info(f"=== Connection ACCEPTED ===")
        logger.info(f"  Username: {session.user.username}")
        logger.info(f"  Room: {room_key}")
        username = session.user.username
        display_name = session.user.display_name
        avatar = session.user.avatar
    except Exception as e:
        logger.error(f"Exception in on_connect: {str(e)}", exc_info=True)
        return False
    
    if room_key not in ROOM_HOSTS:
        logger.info(f"Creating new room: {room_key}, Host: {username}")
        ROOM_HOSTS[room_key] = username
        # Read max_members from auth data (host specifies when creating room)
        max_members = int(auth.get("max_members", 10))
        # Validate range
        if max_members < 1 or max_members > 100:
            max_members = 10
        logger.info(f"Room {room_key} max_members set to: {max_members}")
        room_record = Room(room_key=room_key, host_username=username, max_members=max_members)
        db.session.add(room_record)
        db.session.commit()

    host = ROOM_HOSTS.get(room_key)
    is_host = (username == host)

    # Non-host members need approval
    if not is_host:
        # Get room capacity
        room_record = Room.query.filter_by(room_key=room_key).first()
        max_cap = room_record.max_members if room_record else 10
        
        if len(ROOM_MEMBERS.get(room_key, {})) >= max_cap:
            return False  # Room is full
        
        ROOM_PENDING.setdefault(room_key, set()).add(username)
        join_room(room_key)
        SID_ROOM[request.sid] = room_key
        SID_USERNAME[request.sid] = username
        emit("awaiting_approval", {
            "message": f"Waiting for {host} to approve your entry",
            "host": host,
        })
        emit("join_request", {
            "username": username,
            "display_name": display_name,
        }, room=room_key)
        return

    # Host joins directly
    room_record = Room.query.filter_by(room_key=room_key).first()
    if room_record and len(ROOM_MEMBERS.get(room_key, {})) >= room_record.max_members:
        return False

    join_room(room_key)
    SID_ROOM[request.sid] = room_key
    SID_USERNAME[request.sid] = username
    ROOM_MEMBERS.setdefault(room_key, {})[username] = {
        "username": username,
        "display_name": display_name,
        "avatar": avatar,
        "online": True,
        "is_host": True,
    }
    ROOM_TYPING.setdefault(room_key, set())

    emit("message_history", _get_room_messages(room_key))
    room_info = Room.query.filter_by(room_key=room_key).first()
    max_members = room_info.max_members if room_info else 10
    emit("presence_update", {
        "members": _present_members(room_key),
        "host": host,
        "max_members": max_members,
        "member_count": len(ROOM_MEMBERS.get(room_key, {}))
    }, room=room_key)


@socketio.on("disconnect")
def on_disconnect():
    room_key = SID_ROOM.pop(request.sid, None)
    username = SID_USERNAME.pop(request.sid, None)
    if not room_key or not username:
        return

    ROOM_TYPING.get(room_key, set()).discard(username)
    members = ROOM_MEMBERS.get(room_key, {})
    members.pop(username, None)
    if not members:
        ROOM_MEMBERS.pop(room_key, None)
        ROOM_TYPING.pop(room_key, None)

    emit("presence_update", {"members": _present_members(room_key)}, room=room_key)
    emit("typing_update", {"typing": []}, room=room_key)


@socketio.on("typing")
def on_typing(data):
    room_key = SID_ROOM.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not username:
        return

    is_typing = bool((data or {}).get("typing"))
    typing_users = ROOM_TYPING.setdefault(room_key, set())
    if is_typing:
        typing_users.add(username)
    else:
        typing_users.discard(username)

    emit("typing_update", {"typing": list(typing_users)}, room=room_key)


@socketio.on("send_message")
def on_send_message(data):
    room_key = SID_ROOM.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not username:
        return

    member = _get_member(room_key, username) or {}
    message = str((data or {}).get("message") or "")
    msg_type = str((data or {}).get("type") or "text")
    file_url = (data or {}).get("file_url")
    if msg_type not in {"text", "image", "video", "file"}:
        msg_type = "text"

    message_record = Message(
        id=uuid.uuid4().hex,
        room_key=room_key,
        sender_username=username,
        display_name=member.get("display_name", username),
        avatar=member.get("avatar", ""),
        message=message,
        type=msg_type,
        file_url=file_url,
        timestamp=_utc_timestamp(),
        edited=False,
        deleted=False,
        reactions={},
        reads={username: _utc_timestamp()},
    )
    db.session.add(message_record)
    db.session.commit()

    emit("receive_message", message_record.to_dict(), room=room_key)


@socketio.on("edit_message")
def on_edit_message(data):
    room_key = SID_ROOM.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not username:
        return

    message_id = str((data or {}).get("id") or "").strip()
    new_text = str((data or {}).get("message") or "").strip()
    if not message_id or not new_text:
        return

    msg_obj = _find_message(room_key, message_id)
    if not msg_obj or msg_obj.sender_username != username:
        return

    msg_obj.message = new_text
    msg_obj.edited = True
    db.session.commit()
    emit("message_edited", msg_obj.to_dict(), room=room_key)


@socketio.on("delete_message")
def on_delete_message(data):
    room_key = SID_ROOM.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not username:
        return

    message_id = str((data or {}).get("id") or "").strip()
    if not message_id:
        return

    msg_obj = _find_message(room_key, message_id)
    if not msg_obj or msg_obj.sender_username != username:
        return

    msg_obj.deleted = True
    db.session.commit()
    emit("message_deleted", msg_obj.to_dict(), room=room_key)


@socketio.on("react_message")
def on_react_message(data):
    room_key = SID_ROOM.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not username:
        return

    message_id = str((data or {}).get("id") or "").strip()
    emoji = str((data or {}).get("emoji") or "").strip()
    if not message_id or not emoji:
        return

    msg_obj = _find_message(room_key, message_id)
    if not msg_obj:
        return

    reactions = msg_obj.reactions or {}
    reactions[emoji] = reactions.get(emoji, 0) + 1
    msg_obj.reactions = reactions
    db.session.commit()
    emit("message_reaction", msg_obj.to_dict(), room=room_key)


@socketio.on("read_message")
def on_read_message(data):
    room_key = SID_ROOM.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not username:
        return

    message_id = str((data or {}).get("id") or "").strip()
    if not message_id:
        return

    msg_obj = _find_message(room_key, message_id)
    if not msg_obj:
        return

    reads = msg_obj.reads or {}
    reads[username] = _utc_timestamp()
    msg_obj.reads = reads
    db.session.commit()
    emit("read_receipt", msg_obj.to_dict(), room=room_key)


@socketio.on("approve_join")
def on_approve_join(data):
    room_key = SID_ROOM.get(request.sid)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not host:
        return
    
    if host != ROOM_HOSTS.get(room_key):
        return  # Only host can approve
    
    username = str((data or {}).get("username") or "").strip()
    if not username or username not in ROOM_PENDING.get(room_key, set()):
        return
    
    guest_user = User.query.filter_by(username=username).first()
    if not guest_user:
        return
    
    # Move from pending to members
    ROOM_PENDING.get(room_key, set()).discard(username)
    
    # Check room capacity
    room_record = Room.query.filter_by(room_key=room_key).first()
    max_cap = room_record.max_members if room_record else 10
    
    if len(ROOM_MEMBERS.get(room_key, {})) >= max_cap:
        # Find the pending user's socket and reject
        for sid, u in list(SID_USERNAME.items()):
            if u == username and SID_ROOM.get(sid) == room_key:
                socketio.emit("join_rejected", {"reason": "Room is full"}, to=sid)
        return
    
    ROOM_MEMBERS.setdefault(room_key, {})[username] = {
        "username": username,
        "display_name": guest_user.display_name,
        "avatar": guest_user.avatar,
        "online": True,
        "is_host": False,
    }
    
    # Send message history to approved guest
    for sid, u in list(SID_USERNAME.items()):
        if u == username and SID_ROOM.get(sid) == room_key:
            socketio.emit("message_history", _get_room_messages(room_key), to=sid)
    
    # Notify all users about approval
    emit("join_approved", {"username": username}, room=room_key)
    room_info = Room.query.filter_by(room_key=room_key).first()
    max_members = room_info.max_members if room_info else 10
    emit("presence_update", {
        "members": _present_members(room_key),
        "host": host,
        "max_members": max_members,
        "member_count": len(ROOM_MEMBERS.get(room_key, {}))
    }, room=room_key)


@socketio.on("reject_join")
def on_reject_join(data):
    room_key = SID_ROOM.get(request.sid)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not host:
        return
    
    if host != ROOM_HOSTS.get(room_key):
        return  # Only host can reject
    
    username = str((data or {}).get("username") or "").strip()
    if not username or username not in ROOM_PENDING.get(room_key, set()):
        return
    
    # Remove from pending
    ROOM_PENDING.get(room_key, set()).discard(username)
    
    # Notify rejected user
    for sid, u in list(SID_USERNAME.items()):
        if u == username and SID_ROOM.get(sid) == room_key:
            socketio.emit("join_rejected", {"reason": "Host rejected your request"}, to=sid)
            leave_room(room_key, sid)
            SID_ROOM.pop(sid, None)
            SID_USERNAME.pop(sid, None)
            break


@socketio.on("update_room_capacity")
def on_update_room_capacity(data):
    room_key = SID_ROOM.get(request.sid)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not host:
        return
    
    if host != ROOM_HOSTS.get(room_key):
        return  # Only host can update capacity
    
    max_members = int((data or {}).get("max_members") or 10)
    if max_members < 1:
        max_members = 1
    if max_members > 100:
        max_members = 100
    
    room_record = Room.query.filter_by(room_key=room_key).first()
    if room_record:
        room_record.max_members = max_members
        db.session.commit()
    
    # Notify all room members about capacity change
    emit("room_capacity_updated", {
        "max_members": max_members,
        "member_count": len(ROOM_MEMBERS.get(room_key, {}))
    }, room=room_key)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
