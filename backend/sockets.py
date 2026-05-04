"""
Socket.IO event handlers for real-time features.
Handles: chat, video sync, notes, tasks, presence, pomodoro.
"""
import uuid
import logging
from datetime import datetime

from flask import request
from flask_socketio import emit, join_room, leave_room

from backend.extensions import db, socketio
from backend.models import Room, RoomMember, Message
from backend.auth import _current_user

logger = logging.getLogger(__name__)

# Active connections tracking
SID_TO_USER = {}
SID_TO_ROOM = {}


@socketio.on("connect")
def on_connect(auth=None):
    """Authenticate socket connection via JWT token."""
    try:
        token = None

        # Method 0: Socket.IO auth payload (preferred)
        if isinstance(auth, dict):
            token = auth.get("token", "")
        
        # Method 1: Socket.IO client sends auth in first packet data
        if not token and hasattr(request, 'data') and isinstance(request.data, dict):
            token = request.data.get('token', '')
        
        # Method 2: From query parameters in URL
        if not token:
            token = request.args.get("token", "")
        
        # Method 3: From Authorization header
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        
        # Method 4: Check raw environ
        if not token:
            environ = getattr(request, 'environ', {})
            query = environ.get('QUERY_STRING', '')
            if 'token=' in query:
                from urllib.parse import parse_qs
                parsed = parse_qs(query)
                token = parsed.get('token', [''])[0]

        if not token:
            logger.warning(f"No auth token provided. Data: {getattr(request, 'data', 'None')}")
            return False

        user = _current_user(token)
        if not user:
            logger.warning("Invalid auth token - user not found")
            return False

        SID_TO_USER[request.sid] = {
            "username": user.username,
            "display_name": user.display_name,
            "avatar": user.avatar
        }

        logger.info(f"✅ Socket connected: {user.username} (SID: {request.sid[:8]}...)")
        emit("connected", {"message": "Connected successfully", "username": user.username})

    except Exception as e:
        logger.error(f"Socket auth error: {e}")
        return False


@socketio.on("disconnect")
def on_disconnect():
    """Handle user disconnection - clean up room membership."""
    user_info = SID_TO_USER.pop(request.sid, None)
    room_key = SID_TO_ROOM.pop(request.sid, None)

    if user_info and room_key:
        leave_room(room_key)

        # Check if user has other active connections in this room
        active_sids = [
            sid for sid, rk in SID_TO_ROOM.items()
            if rk == room_key and SID_TO_USER.get(sid, {}).get("username") == user_info["username"]
        ]

        if not active_sids:
            # Update member status in database
            member = RoomMember.query.filter_by(
                room_key=room_key,
                username=user_info["username"]
            ).first()

            if member:
                member.is_online = False
                db.session.commit()

            # Notify others in room
            emit("user_left", {
                "username": user_info["username"],
                "display_name": user_info["display_name"]
            }, room=room_key)

            logger.info(f"❌ User {user_info['username']} disconnected from room {room_key}")
        else:
            logger.info(f"User {user_info['username']} still has active connections in {room_key}")


@socketio.on("join_room")
def on_join_room(data):
    """User joins a chat/study room."""
    room_key = data.get("room_key")
    user_info = SID_TO_USER.get(request.sid)

    if not room_key or not user_info:
        emit("error", {"message": "Unauthorized or missing room key"})
        return

    try:
        # Ensure room exists in database
        room = Room.query.filter_by(room_key=room_key).first()
        if not room:
            room = Room(
                room_key=room_key,
                host_username=user_info["username"]
            )
            db.session.add(room)
            db.session.commit()
            logger.info(f"Created new room: {room_key}")

        # Check room capacity (max 2 members for pair rooms)
        member_count = RoomMember.query.filter_by(room_key=room_key).count()
        existing_member = RoomMember.query.filter_by(
            room_key=room_key,
            username=user_info["username"]
        ).first()

        if not existing_member and member_count >= room.max_members:
            emit("error", {"message": f"Room is full (max {room.max_members} members)"})
            return

        # Add or update member
        if not existing_member:
            member = RoomMember(
                room_key=room_key,
                username=user_info["username"],
                display_name=user_info["display_name"],
                role="host" if room.host_username == user_info["username"] else "member",
                is_online=True
            )
            db.session.add(member)
        else:
            existing_member.is_online = True
            existing_member.display_name = user_info["display_name"]

        db.session.commit()

        # Track room assignment and join Socket.IO room
        SID_TO_ROOM[request.sid] = room_key
        join_room(room_key)

        # Get list of online members
        online_members = RoomMember.query.filter_by(
            room_key=room_key, 
            is_online=True
        ).all()

        # Send current state to the joining user
        emit("room_state", {
            "room_key": room_key,
            "members": [{
                "username": m.username,
                "display_name": m.display_name,
                "role": m.role,
                "is_online": m.is_online
            } for m in online_members]
        })

        # Notify others in room
        emit("user_joined", {
            "username": user_info["username"],
            "display_name": user_info["display_name"]
        }, room=room_key, include_self=False)

        logger.info(f"User {user_info['username']} joined room {room_key}")

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error joining room: {e}")
        emit("error", {"message": "Failed to join room"})


@socketio.on("leave_room")
def on_leave_room():
    """Leave current room."""
    room_key = SID_TO_ROOM.pop(request.sid, None)
    user_info = SID_TO_USER.get(request.sid)

    if room_key and user_info:
        leave_room(room_key)

        # Check for other active connections
        active_sids = [
            sid for sid, rk in SID_TO_ROOM.items()
            if rk == room_key and SID_TO_USER.get(sid, {}).get("username") == user_info["username"]
        ]

        if not active_sids:
            member = RoomMember.query.filter_by(
                room_key=room_key,
                username=user_info["username"]
            ).first()

            if member:
                member.is_online = False
                db.session.commit()

            emit("user_left", {
                "username": user_info["username"],
                "display_name": user_info["display_name"]
            }, room=room_key)

        logger.info(f"User {user_info['username']} left room {room_key}")


@socketio.on("send_message")
def on_send_message(data):
    """Handle incoming chat message."""
    room_key = SID_TO_ROOM.get(request.sid)
    user_info = SID_TO_USER.get(request.sid)

    if not room_key or not user_info:
        emit("error", {"message": "Not in a room"})
        return

    msg_text = data.get("message", "").strip()
    if not msg_text:
        return

    try:
        message_id = uuid.uuid4().hex
        new_msg = Message(
            id=message_id,
            room_key=room_key,
            sender_username=user_info["username"],
            display_name=user_info["display_name"],
            avatar=user_info["avatar"],
            message=msg_text,
            message_type=data.get("message_type", "text"),
            timestamp=datetime.utcnow().isoformat() + "Z",
            reactions={}
        )
        db.session.add(new_msg)
        db.session.commit()

        emit("receive_message", {
            "id": new_msg.id,
            "room_key": room_key,
            "sender_username": new_msg.sender_username,
            "display_name": new_msg.display_name,
            "avatar": new_msg.avatar,
            "message": new_msg.message,
            "message_type": new_msg.message_type,
            "timestamp": new_msg.timestamp,
            "reactions": {}
        }, room=room_key)

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error sending message: {e}")
        emit("error", {"message": "Failed to send message"})


@socketio.on("message_reaction")
def on_message_reaction(data):
    """Add/remove reaction to a message."""
    room_key = SID_TO_ROOM.get(request.sid)
    user_info = SID_TO_USER.get(request.sid)

    if not room_key or not user_info:
        return

    message_id = data.get("message_id")
    emoji = data.get("emoji", "👍")

    try:
        message = Message.query.filter_by(id=message_id, room_key=room_key).first()
        if not message:
            return

        reactions = dict(message.reactions or {})
        
        if emoji in reactions:
            if isinstance(reactions[emoji], dict):
                users = reactions[emoji].get("users", [])
                if user_info["username"] in users:
                    users.remove(user_info["username"])
                else:
                    users.append(user_info["username"])
                reactions[emoji] = {"count": len(users), "users": users}
            else:
                reactions[emoji] = reactions[emoji] + 1
        else:
            reactions[emoji] = {"count": 1, "users": [user_info["username"]]}

        message.reactions = reactions
        db.session.commit()

        emit("message_reaction_update", {
            "message_id": message_id,
            "reactions": reactions
        }, room=room_key)

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating reaction: {e}")


@socketio.on("video_sync_state")
def on_video_sync_state(data):
    """Sync video playback state between users."""
    room_key = SID_TO_ROOM.get(request.sid)
    user_info = SID_TO_USER.get(request.sid)

    if not room_key or not user_info:
        return

    sync_data = {
        "source_url": data.get("source_url", ""),
        "playing": data.get("playing", False),
        "position": data.get("position", 0),
        "playbackRate": data.get("playbackRate", 1),
        "volume": data.get("volume", 1),
        "updated_by": user_info["username"],
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }

    emit("video_sync_state", sync_data, room=room_key, include_self=False)


@socketio.on("sync_notes")
def on_sync_notes(data):
    """Sync shared notes content between users."""
    room_key = data.get("room_key") or SID_TO_ROOM.get(request.sid)
    if not room_key:
        return

    emit("sync_notes", {
        "text": data.get("text", ""),
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }, room=room_key, include_self=False)


@socketio.on("sync_tasks")
def on_sync_tasks(data):
    """Sync task board between users."""
    room_key = data.get("room_key") or SID_TO_ROOM.get(request.sid)
    if not room_key:
        return

    emit("sync_tasks", data.get("tasks", []), room=room_key, include_self=False)


@socketio.on("pomodoro_sync")
def on_pomodoro_sync(data):
    """Sync pomodoro timer between users."""
    room_key = SID_TO_ROOM.get(request.sid)
    if not room_key:
        return

    emit("pomodoro_sync", {
        "time_left": data.get("time_left"),
        "is_active": data.get("is_active"),
        "updated_by": SID_TO_USER.get(request.sid, {}).get("username"),
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }, room=room_key, include_self=False)


@socketio.on("typing")
def on_typing(data):
    """Broadcast typing indicator."""
    room_key = SID_TO_ROOM.get(request.sid)
    user_info = SID_TO_USER.get(request.sid)

    if not room_key or not user_info:
        return

    emit("user_typing", {
        "username": user_info["username"],
        "display_name": user_info["display_name"],
        "is_typing": data.get("is_typing", False)
    }, room=room_key, include_self=False)