from datetime import datetime

from extensions import db
from sqlalchemy import inspect, text, UniqueConstraint


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(128), unique=True, nullable=False)
    display_name = db.Column(db.String(128), nullable=False)
    avatar = db.Column(db.String(32), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sessions = db.relationship("Session", backref="user", lazy=True)

    def to_dict(self):
        return {
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name,
            "avatar": self.avatar,
        }


def ensure_user_email_column():
    table_name = User.__tablename__
    inspector = inspect(db.engine)
    columns = {column["name"] for column in inspector.get_columns(table_name)}

    if "email" not in columns:
        db.session.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN email VARCHAR(128)'))

    db.session.execute(
        text(f'CREATE UNIQUE INDEX IF NOT EXISTS ix_{table_name}_email ON "{table_name}" (email)')
    )
    db.session.commit()


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


class FriendRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_username = db.Column(db.String(64), nullable=False, index=True)
    receiver_username = db.Column(db.String(64), nullable=False, index=True)
    status = db.Column(db.String(16), nullable=False, default="pending", index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    responded_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("sender_username", "receiver_username", name="uq_friend_request_pair_fr"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sender_username": self.sender_username,
            "receiver_username": self.receiver_username,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "responded_at": self.responded_at.isoformat() if self.responded_at else None,
        }


class Friendship(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_a = db.Column(db.String(64), nullable=False, index=True)
    user_b = db.Column(db.String(64), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_a", "user_b", name="uq_friendship_pair_fs"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_a": self.user_a,
            "user_b": self.user_b,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DirectMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_username = db.Column(db.String(64), nullable=False, index=True)
    receiver_username = db.Column(db.String(64), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    read_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "sender_username": self.sender_username,
            "receiver_username": self.receiver_username,
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
        }


class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), nullable=False, index=True)
    kind = db.Column(db.String(32), nullable=False)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "kind": self.kind,
            "payload": self.payload or {},
            "is_read": bool(self.is_read),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
