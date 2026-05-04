"""
REST API routes for rooms, users, and media management.
"""
import logging
from datetime import datetime

from flask import jsonify, request, send_from_directory
from sqlalchemy import func, select

from backend.auth import _current_user
from backend.extensions import db
from backend.models import Room, RoomMember, Message, User
from backend.config import UPLOAD_DIR

logger = logging.getLogger(__name__)


def register_routes(app):
    
    @app.route("/api/me", methods=["GET"])
    def get_current_user():
        """Get current authenticated user profile."""
        try:
            user = _current_user()
            return jsonify(user.to_dict()), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 401

    @app.route("/api/users/<identifier>", methods=["GET"])
    def get_user(identifier):
        """Get user by username or email."""
        try:
            _current_user()  # Ensure authenticated
            user = User.query.filter(
                (func.lower(User.username) == identifier.lower()) |
                (func.lower(User.email) == identifier.lower())
            ).first()
            
            if not user:
                return jsonify({"error": "User not found"}), 404
                
            return jsonify(user.to_dict()), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 401

    @app.route("/api/rooms", methods=["GET"])
    def list_rooms():
        """List rooms where current user is a member."""
        try:
            user = _current_user()
            
            # Get rooms where user is member
            member_rooms = select(RoomMember.room_key).where(
                RoomMember.username == user.username
            )
            
            rooms = Room.query.filter(
                Room.host_username == user.username
            ).union(
                Room.query.filter(Room.room_key.in_(member_rooms))
            ).all()
            
            return jsonify([r.to_dict() for r in rooms]), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 401

    @app.route("/api/rooms", methods=["POST"])
    def create_room():
        """Create a new room."""
        try:
            user = _current_user()
            data = request.json or {}
            room_key = data.get("room_key", "").strip()
            
            if not room_key:
                return jsonify({"error": "Room key is required"}), 400
            
            # Check if room exists
            existing = Room.query.filter_by(room_key=room_key).first()
            if existing:
                return jsonify({"error": "Room already exists", "room": existing.to_dict()}), 409
            
            # Create new room
            room = Room(
                room_key=room_key,
                host_username=user.username,
                room_type=data.get("room_type", "study")
            )
            db.session.add(room)
            
            # Add creator as member
            member = RoomMember(
                room_key=room_key,
                username=user.username,
                display_name=user.display_name,
                role="host",
                is_online=True
            )
            db.session.add(member)
            db.session.commit()
            
            logger.info(f"Room created: {room_key} by {user.username}")
            return jsonify({
                "message": "Room created",
                "room": room.to_dict()
            }), 201
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error creating room: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/rooms/<room_key>", methods=["GET"])
    def get_room(room_key):
        """Get room details."""
        try:
            user = _current_user()
            room = Room.query.filter_by(room_key=room_key).first()
            
            if not room:
                return jsonify({"error": "Room not found"}), 404
            
            # Check if user is member
            member = RoomMember.query.filter_by(
                room_key=room_key, 
                username=user.username
            ).first()
            
            if not member and room.host_username != user.username:
                return jsonify({"error": "Not a member of this room"}), 403
            
            # Get members
            members = RoomMember.query.filter_by(room_key=room_key).all()
            
            return jsonify({
                **room.to_dict(),
                "members": [{
                    "username": m.username,
                    "display_name": m.display_name,
                    "role": m.role,
                    "is_online": m.is_online,
                    "joined_at": m.joined_at.isoformat() if m.joined_at else None
                } for m in members]
            }), 200
            
        except Exception as e:
            return jsonify({"error": str(e)}), 401

    @app.route("/api/rooms/<room_key>/messages", methods=["GET"])
    def get_messages(room_key):
        """Get recent messages for a room."""
        try:
            user = _current_user()
            
            # Check membership
            member = RoomMember.query.filter_by(
                room_key=room_key,
                username=user.username
            ).first()
            
            room = Room.query.filter_by(room_key=room_key, host_username=user.username).first()
            
            if not member and not room:
                return jsonify({"error": "Not a member of this room"}), 403
            
            # Get recent messages (last 50)
            limit = min(int(request.args.get("limit", 50)), 100)
            messages = (
                Message.query
                .filter_by(room_key=room_key)
                .order_by(Message.timestamp.desc())
                .limit(limit)
                .all()
            )
            
            return jsonify([m.to_dict() for m in reversed(messages)]), 200
            
        except Exception as e:
            return jsonify({"error": str(e)}), 401

    @app.route("/api/rooms/<room_key>", methods=["DELETE"])
    def delete_room(room_key):
        """Delete a room (host only)."""
        try:
            user = _current_user()
            room = Room.query.filter_by(room_key=room_key).first()
            
            if not room:
                return jsonify({"error": "Room not found"}), 404
            
            if room.host_username != user.username:
                return jsonify({"error": "Only the host can delete this room"}), 403
            
            db.session.delete(room)
            db.session.commit()
            
            logger.info(f"Room deleted: {room_key}")
            return jsonify({"message": "Room deleted"}), 200
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error deleting room: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/rooms/<room_key>/join", methods=["POST"])
    def join_room(room_key):
        """Join an existing room."""
        try:
            user = _current_user()
            room = Room.query.filter_by(room_key=room_key).first()
            
            if not room:
                return jsonify({"error": "Room not found"}), 404
            
            # Check if already member
            existing = RoomMember.query.filter_by(
                room_key=room_key,
                username=user.username
            ).first()
            
            if existing:
                existing.is_online = True
                db.session.commit()
                return jsonify({"message": "Already a member", "room": room.to_dict()}), 200
            
            # Check room capacity
            member_count = RoomMember.query.filter_by(room_key=room_key).count()
            if member_count >= room.max_members:
                return jsonify({"error": f"Room is full (max {room.max_members} members)"}), 403
            
            # Add as member
            member = RoomMember(
                room_key=room_key,
                username=user.username,
                display_name=user.display_name,
                role="member",
                is_online=True
            )
            db.session.add(member)
            db.session.commit()
            
            logger.info(f"User {user.username} joined room: {room_key}")
            return jsonify({"message": "Joined room", "room": room.to_dict()}), 200
            
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500