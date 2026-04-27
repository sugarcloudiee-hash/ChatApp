import time
import uuid
from datetime import datetime
from pathlib import Path

from flask import request

from backend.extensions import serializer
from backend.models import Message
from backend.state import ROOM_ALLOWED_USERS, ROOM_HOSTS, ROOM_IDS, ROOM_INVITE_TOKENS, ROOM_MEMBERS, ROOM_PENDING, ROOM_PLAYBACK, ROOM_PRIVACY, ROOM_TYPING
from backend.config import ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES


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


def _extract_access_token() -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        print(f"[TOKEN] Extracted from Authorization header: {token[:20]}...")
        return token
    token = (request.args.get("access_token") or "").strip()
    if token:
        print(f"[TOKEN] Extracted from query param: {token[:20]}...")
    return token


def _get_room_messages(room_key: str) -> list[dict]:
    messages = (
        Message.query.filter_by(room_key=room_key)
        .order_by(Message.timestamp.desc())
        .limit(50)
        .all()
    )
    return [message.to_dict() for message in reversed(messages)]


def _get_room_id(room_key: str) -> str:
    if room_key not in ROOM_IDS:
        ROOM_IDS[room_key] = str(uuid.uuid4())
    return ROOM_IDS[room_key]


def _cleanup_room_if_empty(room_key: str):
    members = ROOM_MEMBERS.get(room_key, {})
    has_online_members = any(bool(member.get("online")) for member in members.values())
    if not has_online_members and not ROOM_PENDING.get(room_key):
        ROOM_HOSTS.pop(room_key, None)
        ROOM_IDS.pop(room_key, None)
        ROOM_TYPING.pop(room_key, None)
        ROOM_PENDING.pop(room_key, None)
        ROOM_PLAYBACK.pop(room_key, None)
        ROOM_PRIVACY.pop(room_key, None)
        ROOM_INVITE_TOKENS.pop(room_key, None)
        ROOM_ALLOWED_USERS.pop(room_key, None)


def _get_member(room: str, username: str) -> dict | None:
    return ROOM_MEMBERS.get(room, {}).get(username)


def _present_members(room: str) -> list[dict]:
    return list(ROOM_MEMBERS.get(room, {}).values())


def _get_room_playback(room_key: str) -> dict | None:
    state = ROOM_PLAYBACK.get(room_key)
    if not state:
        return None

    snapshot = dict(state)
    if snapshot.get("playing"):
        updated_at = float(snapshot.get("updated_at") or time.time())
        snapshot["position"] = max(0.0, float(snapshot.get("position") or 0.0) + max(0.0, time.time() - updated_at))
    snapshot["position"] = round(float(snapshot.get("position") or 0.0), 3)
    return snapshot


def _set_room_playback(room_key: str, state: dict | None) -> dict | None:
    if not state:
        ROOM_PLAYBACK.pop(room_key, None)
        return None

    snapshot = {
        "source_url": str(state.get("source_url") or "").strip(),
        "source_kind": str(state.get("source_kind") or "video").strip().lower() or "video",
        "source_title": str(state.get("source_title") or "").strip(),
        "position": max(0.0, float(state.get("position") or 0.0)),
        "playing": bool(state.get("playing")),
        "playback_rate": max(0.25, min(4.0, float(state.get("playback_rate") or 1.0))),
        "updated_at": time.time(),
        "updated_by": str(state.get("updated_by") or "").strip(),
    }
    ROOM_PLAYBACK[room_key] = snapshot
    return _get_room_playback(room_key)


def _find_message(room_key: str, message_id: str):
    return Message.query.filter_by(room_key=room_key, id=message_id).first()
