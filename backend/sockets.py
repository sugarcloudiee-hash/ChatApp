import uuid
import logging
from flask import request
from flask_socketio import disconnect, emit, join_room, leave_room

from auth import _current_user, find_or_sync_user_by_identifier
from extensions import db, socketio
from models import Message, Room, User
from state import ROOM_ALLOWED_USERS, ROOM_HOSTS, ROOM_IDS, ROOM_INVITE_TOKENS, ROOM_MEMBERS, ROOM_PENDING, ROOM_PRIVACY, ROOM_TYPING, SID_ROOM, SID_ROOM_ID, SID_USERNAME
from utils import _cleanup_room_if_empty, _find_message, _get_member, _get_room_id, _get_room_messages, _get_room_playback, _present_members, _set_room_playback, _utc_timestamp


logger = logging.getLogger(__name__)
_SYNC_BROADCASTER_STARTED = False


def _sync_broadcast_worker():
    # Periodically rebroadcast playback state to reduce drift between clients.
    while True:
        socketio.sleep(2)
        for room_key in list(ROOM_IDS.keys()):
            playback_state = _get_room_playback(room_key)
            if not playback_state:
                continue
            room_id = ROOM_IDS.get(room_key)
            if not room_id:
                continue
            socketio.emit("video_sync_state", playback_state, room=room_id)


def _ensure_sync_broadcaster_started():
    global _SYNC_BROADCASTER_STARTED
    if _SYNC_BROADCASTER_STARTED:
        return
    socketio.start_background_task(_sync_broadcast_worker)
    _SYNC_BROADCASTER_STARTED = True


def _emit_room_snapshot(room_key: str, room_id: str | None = None, sid: str | None = None):
    playback_state = _get_room_playback(room_key)
    if playback_state is None:
        return

    target_room_id = room_id or ROOM_IDS.get(room_key)
    if sid:
        socketio.emit("video_sync_state", playback_state, to=sid)
    elif target_room_id:
        emit("video_sync_state", playback_state, room=target_room_id)


def _room_presence_payload(room_key: str) -> dict:
    room_id = ROOM_IDS.get(room_key)
    return {
        "members": _present_members(room_key),
        "host": ROOM_HOSTS.get(room_key),
        "room_key": room_key,
        "is_private": bool(ROOM_PRIVACY.get(room_key, True)),
        "invite_token": ROOM_INVITE_TOKENS.get(room_key, ""),
        "invite_link": f"/?room={room_key}&invite={ROOM_INVITE_TOKENS.get(room_key, '')}" if ROOM_INVITE_TOKENS.get(room_key) else f"/?room={room_key}",
        "member_count": len(ROOM_MEMBERS.get(room_key, {})),
        "room_id": room_id,
    }


def _join_member(room_key: str, room_id: str, username: str, display_name: str, avatar: str, is_host: bool):
    ROOM_MEMBERS.setdefault(room_key, {})[username] = {
        "username": username,
        "display_name": display_name,
        "avatar": avatar,
        "online": True,
        "is_host": is_host,
    }
    ROOM_TYPING.setdefault(room_key, set())


@socketio.on("connect")
def on_connect(auth=None):
    _ensure_sync_broadcaster_started()
    request_sid = request.sid
    logger.debug(f"=== Socket.IO CONNECT handler called ===")
    logger.debug(f"Auth data received: {auth}")
    logger.debug(f"Request SID: {request_sid}")

    try:
        if not isinstance(auth, dict):
            auth = {}

        room_key = str(auth.get("room_key") or request.args.get("room_key") or "").strip()
        token = str(auth.get("access_token") or request.args.get("access_token") or "").strip()
        invite_token = str(auth.get("invite_token") or request.args.get("invite") or request.args.get("invite_token") or "").strip()
        requested_private = auth.get("is_private")
        logger.debug(f"Room key: {room_key}")

        user = _current_user(token if token else None)
        username = user.username
        display_name = user.display_name
        avatar = user.avatar

        if not room_key:
            logger.warning("=== Connection REJECTED ===")
            logger.warning("  Room key present: False")
            return False

        logger.info("=== Connection ACCEPTED ===")
        logger.info(f"  Username: {username}")
        logger.info(f"  Room: {room_key}")
    except Exception as e:
        logger.error(f"Exception in on_connect: {str(e)}", exc_info=True)
        return False

    if room_key not in ROOM_HOSTS:
        logger.info(f"Creating new room: {room_key}, Host: {username}")
        ROOM_HOSTS[room_key] = username
        is_private = True if requested_private is None else bool(requested_private)
        ROOM_PRIVACY[room_key] = is_private
        ROOM_INVITE_TOKENS[room_key] = uuid.uuid4().hex[:12]
        ROOM_ALLOWED_USERS.setdefault(room_key, set())
        room_record = Room(room_key=room_key, host_username=username, max_members=0)
        db.session.add(room_record)
        db.session.commit()

    ROOM_ALLOWED_USERS.setdefault(room_key, set())
    ROOM_PRIVACY.setdefault(room_key, True)
    ROOM_INVITE_TOKENS.setdefault(room_key, uuid.uuid4().hex[:12])

    room_id = _get_room_id(room_key)
    host = ROOM_HOSTS.get(room_key)
    is_host = username == host

    if not is_host:
        is_private_room = bool(ROOM_PRIVACY.get(room_key, True))
        invited_by_username = username in ROOM_ALLOWED_USERS.get(room_key, set())
        invited_by_link = bool(invite_token and invite_token == ROOM_INVITE_TOKENS.get(room_key))
        can_join_directly = (not is_private_room) or invited_by_username or invited_by_link

        join_room(room_id)
        SID_ROOM[request_sid] = room_key
        SID_ROOM_ID[request_sid] = room_id
        SID_USERNAME[request_sid] = username

        if can_join_directly:
            _join_member(room_key, room_id, username, display_name, avatar, False)
            emit("message_history", _get_room_messages(room_key), to=request_sid)
            _emit_room_snapshot(room_key, sid=request_sid)
            emit("presence_update", _room_presence_payload(room_key), room=room_id)
            return

        ROOM_PENDING.setdefault(room_key, set()).add(username)
        emit("awaiting_approval", {
            "message": f"Waiting for {host} to approve your entry",
            "host": host,
        })
        emit("join_request", {
            "username": username,
            "display_name": display_name,
        }, room=room_id)
        return

    join_room(room_id)
    SID_ROOM[request_sid] = room_key
    SID_ROOM_ID[request_sid] = room_id
    SID_USERNAME[request_sid] = username
    _join_member(room_key, room_id, username, display_name, avatar, True)

    emit("message_history", _get_room_messages(room_key))
    emit("presence_update", _room_presence_payload(room_key), room=room_id)
    _emit_room_snapshot(room_key, room_id=room_id)


@socketio.on("disconnect")
def on_disconnect():
    request_sid = request.sid
    room_key = SID_ROOM.pop(request_sid, None)
    room_id = SID_ROOM_ID.pop(request_sid, None)
    username = SID_USERNAME.pop(request_sid, None)
    if not room_key or not room_id or not username:
        return

    leave_room(room_id)
    ROOM_TYPING.get(room_key, set()).discard(username)
    ROOM_PENDING.get(room_key, set()).discard(username)
    members = ROOM_MEMBERS.get(room_key, {})
    members.pop(username, None)
    if not members:
        ROOM_MEMBERS.pop(room_key, None)
        ROOM_TYPING.pop(room_key, None)

    _cleanup_room_if_empty(room_key)
    emit("presence_update", _room_presence_payload(room_key), room=room_id)
    emit("typing_update", {"typing": []}, room=room_id)


@socketio.on("leave_room")
def on_leave_room():
    request_sid = request.sid
    room_key = SID_ROOM.pop(request_sid, None)
    room_id = SID_ROOM_ID.pop(request_sid, None)
    username = SID_USERNAME.pop(request_sid, None)
    if not room_key or not room_id or not username:
        return

    leave_room(room_id)
    ROOM_TYPING.get(room_key, set()).discard(username)
    ROOM_PENDING.get(room_key, set()).discard(username)
    members = ROOM_MEMBERS.get(room_key, {})
    members.pop(username, None)
    if not members:
        ROOM_MEMBERS.pop(room_key, None)
        ROOM_TYPING.pop(room_key, None)

    _cleanup_room_if_empty(room_key)
    emit("presence_update", _room_presence_payload(room_key), room=room_id)
    emit("typing_update", {"typing": []}, room=room_id)
    disconnect()


@socketio.on("typing")
def on_typing(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
        return

    is_typing = bool((data or {}).get("typing"))
    typing_users = ROOM_TYPING.setdefault(room_key, set())
    if is_typing:
        typing_users.add(username)
    else:
        typing_users.discard(username)

    emit("typing_update", {"typing": list(typing_users)}, room=room_id)


@socketio.on("send_message")
def on_send_message(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
        return

    member = _get_member(room_key, username) or {}
    message = str((data or {}).get("message") or "")
    msg_type = str((data or {}).get("type") or "text")
    file_url = (data or {}).get("file_url")
    if msg_type not in {"text", "image", "video", "audio", "file"}:
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
    from extensions import db
    db.session.add(message_record)
    db.session.commit()

    emit("receive_message", message_record.to_dict(), room=room_id)


@socketio.on("edit_message")
def on_edit_message(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
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
    from extensions import db
    db.session.commit()
    emit("message_edited", msg_obj.to_dict(), room=room_id)


@socketio.on("delete_message")
def on_delete_message(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
        return

    message_id = str((data or {}).get("id") or "").strip()
    if not message_id:
        return

    msg_obj = _find_message(room_key, message_id)
    if not msg_obj or msg_obj.sender_username != username:
        return

    msg_obj.deleted = True
    from extensions import db
    db.session.commit()
    emit("message_deleted", msg_obj.to_dict(), room=room_id)


@socketio.on("react_message")
def on_react_message(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
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
    from extensions import db
    db.session.commit()
    emit("message_reaction", msg_obj.to_dict(), room=room_id)


@socketio.on("read_message")
def on_read_message(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
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
    from extensions import db
    db.session.commit()
    emit("read_receipt", msg_obj.to_dict(), room=room_id)


@socketio.on("approve_join")
def on_approve_join(data):
    room_key = SID_ROOM.get(request.sid)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not host:
        return

    if host != ROOM_HOSTS.get(room_key):
        return

    username = str((data or {}).get("username") or "").strip()
    if not username or username not in ROOM_PENDING.get(room_key, set()):
        return

    guest_user = find_or_sync_user_by_identifier(username)
    if not guest_user:
        return

    ROOM_PENDING.get(room_key, set()).discard(username)
    ROOM_ALLOWED_USERS.setdefault(room_key, set()).add(username)

    room_id = ROOM_IDS.get(room_key)
    if not room_id:
        return

    _join_member(room_key, room_id, username, guest_user.display_name, guest_user.avatar, False)

    for sid, u in list(SID_USERNAME.items()):
        if u == username and SID_ROOM.get(sid) == room_key:
            socketio.emit("message_history", _get_room_messages(room_key), to=sid)
            _emit_room_snapshot(room_key, sid=sid)

    emit("join_approved", {"username": username}, room=room_id)
    emit("presence_update", _room_presence_payload(room_key), room=room_id)


@socketio.on("reject_join")
def on_reject_join(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = ROOM_IDS.get(room_key)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not host:
        return

    if host != ROOM_HOSTS.get(room_key):
        return

    username = str((data or {}).get("username") or "").strip()
    if not username or username not in ROOM_PENDING.get(room_key, set()):
        return

    ROOM_PENDING.get(room_key, set()).discard(username)

    for sid, u in list(SID_USERNAME.items()):
        if u == username and SID_ROOM.get(sid) == room_key:
            socketio.emit("join_rejected", {"reason": "Host rejected your request"}, to=sid)
            if room_id:
                leave_room(room_id, sid)
            SID_ROOM.pop(sid, None)
            SID_ROOM_ID.pop(sid, None)
            SID_USERNAME.pop(sid, None)
            break


@socketio.on("invite_user")
def on_invite_user(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = ROOM_IDS.get(room_key)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not host:
        return

    if host != ROOM_HOSTS.get(room_key):
        return

    invitee = str((data or {}).get("username") or "").strip().lower()
    if not invitee:
        return

    user = find_or_sync_user_by_identifier(invitee)
    if not user:
        emit("invite_result", {"ok": False, "message": "User not found"}, to=request.sid)
        return

    ROOM_ALLOWED_USERS.setdefault(room_key, set()).add(invitee)

    invite_payload = {
        "room_key": room_key,
        "is_private": bool(ROOM_PRIVACY.get(room_key, True)),
        "invite_token": ROOM_INVITE_TOKENS.get(room_key, ""),
        "invite_link": f"/?room={room_key}&invite={ROOM_INVITE_TOKENS.get(room_key, '')}",
        "from": host,
    }
    for sid, online_user in list(SID_USERNAME.items()):
        if online_user == invitee:
            socketio.emit("user_invited", invite_payload, to=sid)

    if invitee in ROOM_PENDING.get(room_key, set()):
        ROOM_PENDING.get(room_key, set()).discard(invitee)
        room_member = find_or_sync_user_by_identifier(invitee)
        if room_member:
            _join_member(room_key, room_id, invitee, room_member.display_name, room_member.avatar, False)
            for sid, online_user in list(SID_USERNAME.items()):
                if online_user == invitee and SID_ROOM.get(sid) == room_key:
                    socketio.emit("message_history", _get_room_messages(room_key), to=sid)
                    _emit_room_snapshot(room_key, sid=sid)
            emit("join_approved", {"username": invitee}, room=room_id)
            emit("presence_update", _room_presence_payload(room_key), room=room_id)

    emit("invite_result", {"ok": True, "username": invitee}, to=request.sid)


@socketio.on("update_room_capacity")
def on_update_room_capacity(data):
    room_key = SID_ROOM.get(request.sid)
    host = SID_USERNAME.get(request.sid)
    if not room_key or not host:
        return

    if host != ROOM_HOSTS.get(room_key):
        return

    room_id = ROOM_IDS.get(room_key)
    emit("room_capacity_updated", {
        "max_members": None,
        "member_count": len(ROOM_MEMBERS.get(room_key, {}))
    }, room=room_id)


@socketio.on("video_sync_load")
def on_video_sync_load(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
        return

    # Keep playback authoritative from a single controller (room host)
    # so all connected clients follow the same timeline.
    if username != ROOM_HOSTS.get(room_key):
        emit("video_sync_denied", {"reason": "Only the host can control synchronized playback."}, to=request.sid)
        return

    member = _get_member(room_key, username)
    if not member:
        return

    source_url = str((data or {}).get("source_url") or "").strip()
    source_title = str((data or {}).get("source_title") or "").strip()
    if not source_url:
        return

    playback_state = _set_room_playback(room_key, {
        "source_url": source_url,
        "source_kind": str((data or {}).get("source_kind") or "video").strip().lower() or "video",
        "source_title": source_title,
        "position": 0,
        "playing": False,
        "playback_rate": 1,
        "updated_by": username,
    })
    emit("video_sync_state", playback_state, room=room_id, skip_sid=request.sid)


@socketio.on("video_sync_state")
def on_video_sync_state(data):
    room_key = SID_ROOM.get(request.sid)
    room_id = SID_ROOM_ID.get(request.sid)
    username = SID_USERNAME.get(request.sid)
    if not room_key or not room_id or not username:
        return

    # Keep playback authoritative from a single controller (room host)
    # so all connected clients follow the same timeline.
    if username != ROOM_HOSTS.get(room_key):
        emit("video_sync_denied", {"reason": "Only the host can control synchronized playback."}, to=request.sid)
        return

    member = _get_member(room_key, username)
    if not member:
        return

    source_url = str((data or {}).get("source_url") or "").strip()
    if not source_url:
        return

    playback_state = _set_room_playback(room_key, {
        "source_url": source_url,
        "source_kind": str((data or {}).get("source_kind") or "video").strip().lower() or "video",
        "source_title": str((data or {}).get("source_title") or "").strip(),
        "position": float((data or {}).get("current_time") or 0.0),
        "playing": bool((data or {}).get("playing")),
        "playback_rate": float((data or {}).get("playback_rate") or 1.0),
        "updated_by": username,
    })
    emit("video_sync_state", playback_state, room=room_id, skip_sid=request.sid)
