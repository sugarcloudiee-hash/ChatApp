import json
import os
import time
import uuid
from copy import deepcopy

try:
    import redis
except Exception:  # pragma: no cover - optional dependency
    redis = None


REDIS_URL = os.environ.get("REDIS_URL", "").strip()
_REDIS_CLIENT = None

# PARTY_QUEUE_BACKEND controls queue persistence behavior:
# - memory: always use in-process memory storage
# - auto: use Redis when available, otherwise memory (default)
# - redis: prefer Redis; fallback to memory if unavailable
PARTY_QUEUE_BACKEND = str(os.environ.get("PARTY_QUEUE_BACKEND") or "auto").strip().lower()
if PARTY_QUEUE_BACKEND not in {"memory", "auto", "redis"}:
    PARTY_QUEUE_BACKEND = "auto"

if PARTY_QUEUE_BACKEND != "memory" and redis and REDIS_URL:
    try:
        _REDIS_CLIENT = redis.from_url(REDIS_URL, decode_responses=True)
        _REDIS_CLIENT.ping()
    except Exception:
        _REDIS_CLIENT = None


_MEMORY_QUEUES: dict[str, list[dict]] = {}
_MEMORY_NOW_PLAYING: dict[str, dict | None] = {}
_MEMORY_VOTES: dict[str, dict[str, set[str]]] = {}


def _queue_key(room_id: str) -> str:
    return f"partyq:{room_id}:items"


def _now_key(room_id: str) -> str:
    return f"partyq:{room_id}:nowplaying"


def _vote_key(room_id: str, track_id: str) -> str:
    return f"partyq:{room_id}:votes:{track_id}"


def _normalize_track(track: dict, added_by: str) -> dict:
    title = str((track or {}).get("title") or "Untitled track").strip()
    url = str((track or {}).get("url") or "").strip()
    if not url:
        raise ValueError("Track URL is required")

    try:
        duration = float((track or {}).get("duration") or 0)
    except Exception:
        duration = 0.0

    return {
        "id": str((track or {}).get("id") or uuid.uuid4().hex),
        "title": title,
        "url": url,
        "duration": max(0.0, duration),
        "added_by": str(added_by or "").strip().lower(),
        "votes": int((track or {}).get("votes") or 0),
        "added_at": float((track or {}).get("added_at") or time.time()),
    }


def _sort_queue(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda item: (-int(item.get("votes", 0)), float(item.get("added_at", 0))))


def _strip_internal_fields(track: dict | None) -> dict | None:
    if not track:
        return None
    payload = deepcopy(track)
    payload.pop("added_at", None)
    return payload


def _strip_queue_internal_fields(items: list[dict]) -> list[dict]:
    return [_strip_internal_fields(item) for item in items]


def _redis_get_queue(room_id: str) -> list[dict]:
    if not _REDIS_CLIENT:
        return []
    raw_items = _REDIS_CLIENT.lrange(_queue_key(room_id), 0, -1)
    return [json.loads(item) for item in raw_items]


def _redis_save_queue(room_id: str, items: list[dict]) -> None:
    if not _REDIS_CLIENT:
        return
    key = _queue_key(room_id)
    pipe = _REDIS_CLIENT.pipeline()
    pipe.delete(key)
    if items:
        pipe.rpush(key, *[json.dumps(item) for item in items])
    pipe.execute()


def _redis_get_now_playing(room_id: str) -> dict | None:
    if not _REDIS_CLIENT:
        return None
    raw = _REDIS_CLIENT.get(_now_key(room_id))
    return json.loads(raw) if raw else None


def _redis_set_now_playing(room_id: str, track: dict | None) -> None:
    if not _REDIS_CLIENT:
        return
    key = _now_key(room_id)
    if track:
        _REDIS_CLIENT.set(key, json.dumps(track))
    else:
        _REDIS_CLIENT.delete(key)


def _redis_vote_count(room_id: str, track_id: str) -> int:
    if not _REDIS_CLIENT:
        return 0
    return int(_REDIS_CLIENT.scard(_vote_key(room_id, track_id)))


def _redis_has_voted(room_id: str, track_id: str, user_id: str) -> bool:
    if not _REDIS_CLIENT:
        return False
    return bool(_REDIS_CLIENT.sismember(_vote_key(room_id, track_id), user_id))


def _redis_add_vote(room_id: str, track_id: str, user_id: str) -> None:
    if not _REDIS_CLIENT:
        return
    _REDIS_CLIENT.sadd(_vote_key(room_id, track_id), user_id)


def _redis_clear_votes_for_track(room_id: str, track_id: str) -> None:
    if not _REDIS_CLIENT:
        return
    _REDIS_CLIENT.delete(_vote_key(room_id, track_id))


def _redis_clear_room_votes(room_id: str) -> None:
    if not _REDIS_CLIENT:
        return
    pattern = _vote_key(room_id, "*")
    keys = _REDIS_CLIENT.keys(pattern)
    if keys:
        _REDIS_CLIENT.delete(*keys)


def add_to_queue(room_id: str, track: dict, added_by: str = "") -> dict:
    room = str(room_id or "").strip().lower()
    if not room:
        raise ValueError("room_id is required")

    normalized = _normalize_track(track, added_by)

    if _REDIS_CLIENT:
        queue = _redis_get_queue(room)
        queue.append(normalized)
        queue = _sort_queue(queue)
        _redis_save_queue(room, queue)
        return _strip_internal_fields(normalized)

    queue = _MEMORY_QUEUES.setdefault(room, [])
    queue.append(normalized)
    _MEMORY_QUEUES[room] = _sort_queue(queue)
    _MEMORY_VOTES.setdefault(room, {})
    return _strip_internal_fields(normalized)


def get_queue(room_id: str) -> list[dict]:
    room = str(room_id or "").strip().lower()
    if not room:
        return []

    if _REDIS_CLIENT:
        queue = _redis_get_queue(room)
        return _strip_queue_internal_fields(queue)

    queue = _MEMORY_QUEUES.get(room, [])
    return _strip_queue_internal_fields(queue)


def get_now_playing(room_id: str) -> dict | None:
    room = str(room_id or "").strip().lower()
    if not room:
        return None

    if _REDIS_CLIENT:
        return _strip_internal_fields(_redis_get_now_playing(room))

    return _strip_internal_fields(_MEMORY_NOW_PLAYING.get(room))


def play_next(room_id: str) -> dict | None:
    room = str(room_id or "").strip().lower()
    if not room:
        return None

    if _REDIS_CLIENT:
        queue = _redis_get_queue(room)
        if not queue:
            _redis_set_now_playing(room, None)
            return None
        next_track = queue.pop(0)
        _redis_save_queue(room, queue)
        _redis_set_now_playing(room, next_track)
        _redis_clear_votes_for_track(room, str(next_track.get("id") or ""))
        return _strip_internal_fields(next_track)

    queue = _MEMORY_QUEUES.get(room, [])
    if not queue:
        _MEMORY_NOW_PLAYING[room] = None
        return None

    next_track = queue.pop(0)
    _MEMORY_QUEUES[room] = queue
    _MEMORY_NOW_PLAYING[room] = next_track
    _MEMORY_VOTES.get(room, {}).pop(str(next_track.get("id") or ""), None)
    return _strip_internal_fields(next_track)


def remove_from_queue(room_id: str, track_id: str) -> bool:
    room = str(room_id or "").strip().lower()
    target = str(track_id or "").strip()
    if not room or not target:
        return False

    if _REDIS_CLIENT:
        queue = _redis_get_queue(room)
        before = len(queue)
        queue = [item for item in queue if str(item.get("id") or "") != target]
        removed = len(queue) != before
        if removed:
            _redis_save_queue(room, queue)
            _redis_clear_votes_for_track(room, target)
        return removed

    queue = _MEMORY_QUEUES.get(room, [])
    before = len(queue)
    queue = [item for item in queue if str(item.get("id") or "") != target]
    removed = len(queue) != before
    if removed:
        _MEMORY_QUEUES[room] = queue
        _MEMORY_VOTES.get(room, {}).pop(target, None)
    return removed


def clear_queue(room_id: str) -> None:
    room = str(room_id or "").strip().lower()
    if not room:
        return

    if _REDIS_CLIENT:
        _redis_save_queue(room, [])
        _redis_set_now_playing(room, None)
        _redis_clear_room_votes(room)
        return

    _MEMORY_QUEUES[room] = []
    _MEMORY_NOW_PLAYING[room] = None
    _MEMORY_VOTES[room] = {}


def vote_track(room_id: str, track_id: str, user_id: str) -> tuple[bool, list[dict]]:
    room = str(room_id or "").strip().lower()
    track = str(track_id or "").strip()
    user = str(user_id or "").strip().lower()
    if not room or not track or not user:
        return (False, get_queue(room))

    if _REDIS_CLIENT:
        queue = _redis_get_queue(room)
        target = next((item for item in queue if str(item.get("id") or "") == track), None)
        if not target:
            return (False, _strip_queue_internal_fields(queue))

        if _redis_has_voted(room, track, user):
            return (False, _strip_queue_internal_fields(queue))

        _redis_add_vote(room, track, user)
        votes = _redis_vote_count(room, track)
        target["votes"] = votes
        queue = _sort_queue(queue)
        _redis_save_queue(room, queue)
        return (True, _strip_queue_internal_fields(queue))

    queue = _MEMORY_QUEUES.get(room, [])
    target = next((item for item in queue if str(item.get("id") or "") == track), None)
    if not target:
        return (False, _strip_queue_internal_fields(queue))

    room_votes = _MEMORY_VOTES.setdefault(room, {})
    voters = room_votes.setdefault(track, set())
    if user in voters:
        return (False, _strip_queue_internal_fields(queue))

    voters.add(user)
    target["votes"] = len(voters)
    queue = _sort_queue(queue)
    _MEMORY_QUEUES[room] = queue
    return (True, _strip_queue_internal_fields(queue))


def queue_snapshot(room_id: str) -> dict:
    room = str(room_id or "").strip().lower()
    return {
        "room_id": room,
        "now_playing": get_now_playing(room),
        "queue": get_queue(room),
    }


def has_backend_redis() -> bool:
    return bool(_REDIS_CLIENT)


def queue_backend_name() -> str:
    return "redis" if _REDIS_CLIENT else "memory"
