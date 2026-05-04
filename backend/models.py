"""
Database models for users, rooms, messages.
"""
from datetime import datetime
from backend.extensions import db


class User(db.Model):
    __tablename__ = "user"
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(128), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(128), nullable=False)
    avatar = db.Column(db.String(32), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    theme = db.Column(db.String(10), default='dark')
    
    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name,
            "avatar": self.avatar,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "theme": self.theme
        }


class Room(db.Model):
    __tablename__ = "room"
    
    id = db.Column(db.Integer, primary_key=True)
    room_key = db.Column(db.String(64), unique=True, nullable=False, index=True)
    host_username = db.Column(db.String(64), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    max_members = db.Column(db.Integer, default=2)
    room_type = db.Column(db.String(16), default='study')
    
    members = db.relationship('RoomMember', backref='room', cascade='all, delete-orphan', lazy=True)
    messages = db.relationship('Message', backref='room', cascade='all, delete-orphan', lazy=True)
    
    def to_dict(self):
        return {
            "room_key": self.room_key,
            "host_username": self.host_username,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_active": self.is_active,
            "room_type": self.room_type,
            "member_count": len(self.members) if self.members else 0
        }


class RoomMember(db.Model):
    __tablename__ = "room_member"
    
    id = db.Column(db.Integer, primary_key=True)
    room_key = db.Column(db.String(64), db.ForeignKey("room.room_key", ondelete="CASCADE"), nullable=False, index=True)
    username = db.Column(db.String(64), nullable=False, index=True)
    display_name = db.Column(db.String(128))
    role = db.Column(db.String(32), default='member')
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_online = db.Column(db.Boolean, default=False)


class Message(db.Model):
    __tablename__ = "message"
    
    id = db.Column(db.String(32), primary_key=True)
    room_key = db.Column(db.String(64), db.ForeignKey("room.room_key", ondelete="CASCADE"), nullable=False, index=True)
    sender_username = db.Column(db.String(64), nullable=False)
    display_name = db.Column(db.String(128), nullable=False)
    avatar = db.Column(db.String(32), nullable=False)
    message = db.Column(db.Text, nullable=True)
    message_type = db.Column(db.String(16), default='text')
    file_url = db.Column(db.String(256), nullable=True)
    timestamp = db.Column(db.String(32), nullable=False)
    edited = db.Column(db.Boolean, default=False)
    deleted = db.Column(db.Boolean, default=False)
    reactions = db.Column(db.JSON, default=dict, nullable=False)
    
    def to_dict(self):
        return {
            "id": self.id,
            "room_key": self.room_key,
            "sender_username": self.sender_username,
            "display_name": self.display_name,
            "avatar": self.avatar,
            "message": self.message if not self.deleted else "[Message deleted]",
            "message_type": self.message_type,
            "file_url": self.file_url,
            "timestamp": self.timestamp,
            "edited": self.edited,
            "deleted": self.deleted,
            "reactions": self.reactions or {},
        }