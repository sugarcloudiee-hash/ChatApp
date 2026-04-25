import json
import re
import uuid
from datetime import datetime
from pathlib import Path

import requests
from flask import jsonify, request, send_from_directory
from sqlalchemy import and_, or_
from werkzeug.utils import secure_filename

from auth import _current_user, find_or_sync_user_by_identifier
from config import FRONTEND_DIR, UPLOAD_DIR
from extensions import db, supabase
from models import DirectMessage, FriendRequest, Friendship, Notification, User
from sockets import emit_social_refresh
from utils import _allowed_file, _make_file_token, _verify_file_token, _extract_room_key


def _friendship_pair(username_a: str, username_b: str) -> tuple[str, str]:
    clean_a = str(username_a or "").strip().lower()
    clean_b = str(username_b or "").strip().lower()
    return (clean_a, clean_b) if clean_a <= clean_b else (clean_b, clean_a)


def _is_friends(username_a: str, username_b: str) -> bool:
    user_a, user_b = _friendship_pair(username_a, username_b)
    return Friendship.query.filter_by(user_a=user_a, user_b=user_b).first() is not None


def _create_notification(username: str, kind: str, payload: dict):
    note = Notification(
        username=str(username or "").strip().lower(),
        kind=kind,
        payload=payload or {},
        is_read=False,
    )
    db.session.add(note)
    return note


def register_routes(app):
    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/me")
    def me():
        user = _current_user()
        return jsonify({"user": user.to_dict()})

    @app.get("/favicon.ico")
    def favicon():
        return "", 204

    @app.post("/session")
    def create_session():
        user = _current_user()
        return jsonify({"user": user.to_dict()}), 200

    @app.patch("/theme")
    def update_theme():
        user = _current_user()
        payload = request.get_json(silent=True) or {}
        next_theme = str(payload.get("theme") or "").strip().lower()
        if next_theme not in {"dark", "light"}:
            return jsonify({"error": "Theme must be either dark or light."}), 400

        try:
            supabase.table("user").update({"theme": next_theme}).eq("email", user.email).execute()
        except Exception as exc:
            return jsonify({"error": f"Failed to save theme preference: {exc}"}), 502

        return jsonify({"theme": next_theme}), 200

    @app.get("/social/users/search")
    def social_search_users():
        user = _current_user()
        query = str(request.args.get("q") or "").strip().lower()
        if len(query) < 2:
            return jsonify({"users": []}), 200

        users = (
            User.query.filter(
                and_(
                    User.username != user.username,
                    or_(
                        User.username.ilike(f"%{query}%"),
                        User.display_name.ilike(f"%{query}%"),
                        User.email.ilike(f"%{query}%"),
                    ),
                )
            )
            .order_by(User.display_name.asc())
            .limit(20)
            .all()
        )

        return jsonify(
            {
                "users": [
                    {
                        "username": u.username,
                        "display_name": u.display_name,
                        "avatar": u.avatar,
                        "email": u.email,
                    }
                    for u in users
                ]
            }
        ), 200

    @app.get("/social/friends")
    def social_friends():
        user = _current_user()
        friendships = Friendship.query.filter(
            or_(Friendship.user_a == user.username, Friendship.user_b == user.username)
        ).all()

        friend_usernames = []
        for row in friendships:
            friend_usernames.append(row.user_b if row.user_a == user.username else row.user_a)

        profiles = []
        if friend_usernames:
            profiles = (
                User.query.filter(User.username.in_(friend_usernames))
                .order_by(User.display_name.asc())
                .all()
            )

        return jsonify(
            {
                "friends": [
                    {
                        "username": p.username,
                        "display_name": p.display_name,
                        "avatar": p.avatar,
                        "email": p.email,
                    }
                    for p in profiles
                ]
            }
        ), 200

    @app.get("/social/friend-requests")
    def social_friend_requests():
        user = _current_user()
        incoming = FriendRequest.query.filter_by(receiver_username=user.username, status="pending").all()
        outgoing = FriendRequest.query.filter_by(sender_username=user.username, status="pending").all()

        usernames = set()
        for row in incoming:
            usernames.add(row.sender_username)
        for row in outgoing:
            usernames.add(row.receiver_username)

        profile_map = {}
        if usernames:
            for profile in User.query.filter(User.username.in_(list(usernames))).all():
                profile_map[profile.username] = {
                    "username": profile.username,
                    "display_name": profile.display_name,
                    "avatar": profile.avatar,
                    "email": profile.email,
                }

        return jsonify(
            {
                "incoming": [
                    {
                        **row.to_dict(),
                        "sender_profile": profile_map.get(row.sender_username),
                    }
                    for row in incoming
                ],
                "outgoing": [
                    {
                        **row.to_dict(),
                        "receiver_profile": profile_map.get(row.receiver_username),
                    }
                    for row in outgoing
                ],
            }
        ), 200

    @app.post("/social/friend-requests")
    def social_send_friend_request():
        user = _current_user()
        payload = request.get_json(silent=True) or {}
        target = str(payload.get("username") or "").strip().lower()
        if not target:
            return jsonify({"error": "Target username is required."}), 400

        if target == user.username:
            return jsonify({"error": "You cannot add yourself."}), 400

        target_user = User.query.filter_by(username=target).first() or find_or_sync_user_by_identifier(target)
        if not target_user:
            return jsonify({"error": "User not found."}), 404

        target_username = target_user.username
        if _is_friends(user.username, target_username):
            return jsonify({"error": "Already friends."}), 409

        reverse_pending = FriendRequest.query.filter_by(
            sender_username=target_username,
            receiver_username=user.username,
            status="pending",
        ).first()
        if reverse_pending:
            user_a, user_b = _friendship_pair(user.username, target_username)
            friendship = Friendship(user_a=user_a, user_b=user_b)
            reverse_pending.status = "accepted"
            reverse_pending.responded_at = datetime.utcnow()
            db.session.add(friendship)
            _create_notification(
                target_username,
                "friend_request_accepted",
                {
                    "username": user.username,
                    "display_name": user.display_name,
                },
            )
            db.session.commit()
            emit_social_refresh(user.username, target_username)
            return jsonify({"friendship": friendship.to_dict(), "auto_accepted": True}), 200

        existing = FriendRequest.query.filter_by(
            sender_username=user.username,
            receiver_username=target_username,
        ).first()

        if existing and existing.status == "pending":
            return jsonify({"friend_request": existing.to_dict()}), 200

        if existing:
            existing.status = "pending"
            existing.responded_at = None
            friend_request = existing
        else:
            friend_request = FriendRequest(
                sender_username=user.username,
                receiver_username=target_username,
                status="pending",
            )
            db.session.add(friend_request)

        _create_notification(
            target_username,
            "friend_request",
            {
                "username": user.username,
                "display_name": user.display_name,
            },
        )
        db.session.commit()
        emit_social_refresh(user.username, target_username)

        return jsonify({"friend_request": friend_request.to_dict()}), 201

    @app.post("/social/friend-requests/<int:request_id>/accept")
    def social_accept_friend_request(request_id: int):
        user = _current_user()
        friend_request = FriendRequest.query.filter_by(
            id=request_id,
            receiver_username=user.username,
            status="pending",
        ).first()
        if not friend_request:
            return jsonify({"error": "Friend request not found."}), 404

        user_a, user_b = _friendship_pair(friend_request.sender_username, user.username)
        existing_friendship = Friendship.query.filter_by(user_a=user_a, user_b=user_b).first()
        if not existing_friendship:
            existing_friendship = Friendship(user_a=user_a, user_b=user_b)
            db.session.add(existing_friendship)

        friend_request.status = "accepted"
        friend_request.responded_at = datetime.utcnow()

        reverse = FriendRequest.query.filter_by(
            sender_username=user.username,
            receiver_username=friend_request.sender_username,
            status="pending",
        ).first()
        if reverse:
            reverse.status = "accepted"
            reverse.responded_at = datetime.utcnow()

        _create_notification(
            friend_request.sender_username,
            "friend_request_accepted",
            {
                "username": user.username,
                "display_name": user.display_name,
            },
        )
        db.session.commit()
        emit_social_refresh(user.username, friend_request.sender_username)
        return jsonify({"friendship": existing_friendship.to_dict(), "friend_request": friend_request.to_dict()}), 200

    @app.post("/social/friend-requests/<int:request_id>/reject")
    def social_reject_friend_request(request_id: int):
        user = _current_user()
        friend_request = FriendRequest.query.filter_by(
            id=request_id,
            receiver_username=user.username,
            status="pending",
        ).first()
        if not friend_request:
            return jsonify({"error": "Friend request not found."}), 404

        friend_request.status = "rejected"
        friend_request.responded_at = datetime.utcnow()
        db.session.commit()
        emit_social_refresh(user.username, friend_request.sender_username)
        return jsonify({"friend_request": friend_request.to_dict()}), 200

    @app.get("/social/chats")
    def social_chat_list():
        user = _current_user()
        friendships = Friendship.query.filter(
            or_(Friendship.user_a == user.username, Friendship.user_b == user.username)
        ).all()

        friend_usernames = [row.user_b if row.user_a == user.username else row.user_a for row in friendships]
        friend_profiles = {}
        if friend_usernames:
            for profile in User.query.filter(User.username.in_(friend_usernames)).all():
                friend_profiles[profile.username] = {
                    "username": profile.username,
                    "display_name": profile.display_name,
                    "avatar": profile.avatar,
                    "email": profile.email,
                }

        conversation_map = {
            username: {
                "friend": friend_profiles.get(username, {"username": username, "display_name": username, "avatar": "?", "email": ""}),
                "last_message": None,
                "unread": 0,
            }
            for username in friend_usernames
        }

        if friend_usernames:
            rows = (
                DirectMessage.query.filter(
                    or_(
                        and_(DirectMessage.sender_username == user.username, DirectMessage.receiver_username.in_(friend_usernames)),
                        and_(DirectMessage.receiver_username == user.username, DirectMessage.sender_username.in_(friend_usernames)),
                    )
                )
                .order_by(DirectMessage.created_at.desc())
                .all()
            )

            for row in rows:
                friend_username = row.receiver_username if row.sender_username == user.username else row.sender_username
                convo = conversation_map.get(friend_username)
                if not convo:
                    continue
                if convo["last_message"] is None:
                    convo["last_message"] = row.to_dict()
                if row.receiver_username == user.username and row.read_at is None:
                    convo["unread"] += 1

        conversations = list(conversation_map.values())
        conversations.sort(
            key=lambda item: item["last_message"]["created_at"] if item["last_message"] else "",
            reverse=True,
        )

        return jsonify({"conversations": conversations}), 200

    @app.get("/social/chats/<friend_username>/messages")
    def social_chat_messages(friend_username: str):
        user = _current_user()
        peer = str(friend_username or "").strip().lower()
        if not peer:
            return jsonify({"error": "Friend username is required."}), 400
        if not _is_friends(user.username, peer):
            return jsonify({"error": "You can only message accepted friends."}), 403

        rows = (
            DirectMessage.query.filter(
                or_(
                    and_(DirectMessage.sender_username == user.username, DirectMessage.receiver_username == peer),
                    and_(DirectMessage.sender_username == peer, DirectMessage.receiver_username == user.username),
                )
            )
            .order_by(DirectMessage.created_at.asc())
            .limit(250)
            .all()
        )

        updated = False
        for row in rows:
            if row.receiver_username == user.username and row.read_at is None:
                row.read_at = datetime.utcnow()
                updated = True

        if updated:
            db.session.commit()

        friend_profile = User.query.filter_by(username=peer).first()
        return jsonify(
            {
                "friend": {
                    "username": peer,
                    "display_name": friend_profile.display_name if friend_profile else peer,
                    "avatar": friend_profile.avatar if friend_profile else "?",
                    "email": friend_profile.email if friend_profile else "",
                },
                "messages": [row.to_dict() for row in rows],
            }
        ), 200

    @app.post("/social/chats/<friend_username>/messages")
    def social_send_chat_message(friend_username: str):
        user = _current_user()
        peer = str(friend_username or "").strip().lower()
        if not peer:
            return jsonify({"error": "Friend username is required."}), 400
        if not _is_friends(user.username, peer):
            return jsonify({"error": "You can only message accepted friends."}), 403

        payload = request.get_json(silent=True) or {}
        text = str(payload.get("message") or "").strip()
        if not text:
            return jsonify({"error": "Message cannot be empty."}), 400

        message_row = DirectMessage(
            sender_username=user.username,
            receiver_username=peer,
            message=text,
            created_at=datetime.utcnow(),
            read_at=None,
        )
        db.session.add(message_row)

        _create_notification(
            peer,
            "direct_message",
            {
                "from": user.username,
                "display_name": user.display_name,
                "preview": text[:120],
            },
        )
        db.session.commit()
        emit_social_refresh(user.username, peer)

        return jsonify({"message": message_row.to_dict()}), 201

    @app.get("/social/notifications")
    def social_notifications():
        user = _current_user()
        limit = min(100, max(1, int(request.args.get("limit") or 40)))
        rows = (
            Notification.query.filter_by(username=user.username)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .all()
        )
        return jsonify({"notifications": [row.to_dict() for row in rows]}), 200

    @app.post("/social/notifications/read-all")
    def social_notifications_read_all():
        user = _current_user()
        rows = Notification.query.filter_by(username=user.username, is_read=False).all()
        for row in rows:
            row.is_read = True
        db.session.commit()
        emit_social_refresh(user.username)
        return jsonify({"updated": len(rows)}), 200

    @app.post("/upload")
    def upload():
        user = _current_user()
        if not user:
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

    @app.get("/youtube-search")
    def youtube_search():
        query = str(request.args.get("q") or "").strip()
        if not query:
            return jsonify({"items": []}), 200

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            response = requests.get(
                "https://www.youtube.com/results",
                params={"search_query": query},
                headers=headers,
                timeout=10,
            )
            html = response.text
        except Exception:
            return jsonify({"items": []}), 200

        def extract_initial_data(text):
            patterns = [r"var ytInitialData\s*=\s*", r"window\[\"ytInitialData\"\]\s*=\s*"]
            for pattern in patterns:
                match = re.search(pattern, text)
                if not match:
                    continue
                start = match.end()
                brace_count = 0
                in_string = False
                escape = False
                for idx, ch in enumerate(text[start:], start):
                    if ch == "\\" and not escape:
                        escape = True
                        continue
                    if ch == '"' and not escape:
                        in_string = not in_string
                    if in_string:
                        escape = False
                        continue
                    if ch == "{":
                        brace_count += 1
                    elif ch == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            return text[start:idx + 1]
                    escape = False
            return None

        json_text = extract_initial_data(html)
        if not json_text:
            return jsonify({"items": []}), 200

        try:
            data = json.loads(json_text)
        except Exception:
            return jsonify({"items": []}), 200

        def collect_videos(node, found):
            if isinstance(node, dict):
                if "videoRenderer" in node:
                    found.append(node["videoRenderer"])
                for child in node.values():
                    collect_videos(child, found)
            elif isinstance(node, list):
                for child in node:
                    collect_videos(child, found)

        renderers = []
        collect_videos(data, renderers)

        items = []
        for renderer in renderers:
            video_id = renderer.get("videoId")
            if not video_id:
                continue
            title_runs = renderer.get("title", {}).get("runs", [])
            title = "".join([run.get("text", "") for run in title_runs])
            thumbnails = renderer.get("thumbnail", {}).get("thumbnails", [])
            thumbnail = thumbnails[-1].get("url") if thumbnails else ""
            channel_runs = renderer.get("ownerText", {}).get("runs", [])
            channel = "".join([run.get("text", "") for run in channel_runs])
            duration = renderer.get("lengthText", {}).get("simpleText", "")
            items.append(
                {
                    "id": video_id,
                    "title": title,
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "thumbnail": thumbnail,
                    "channel": channel,
                    "duration": duration,
                }
            )
            if len(items) >= 10:
                break

        seen = set()
        unique_items = []
        for item in items:
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            unique_items.append(item)

        return jsonify({"items": unique_items}), 200

    @app.get("/download/<token>")
    def download(token: str):
        try:
            filename = _verify_file_token(token)
        except Exception:
            return jsonify({"error": "Invalid or expired download token"}), 403

        return send_from_directory(str(UPLOAD_DIR), filename, as_attachment=True)

    @app.get("/<path:path>")
    def frontend_assets(path: str):
        asset_path = Path(app.static_folder) / path
        if asset_path.exists() and asset_path.is_file():
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")
