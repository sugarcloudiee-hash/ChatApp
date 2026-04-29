# ChatApp

Chat app with Flask + Socket.IO backend and React frontend.

## Redis Support

This project now supports Redis in two ways:

1. Socket.IO scaling across multiple backend instances via Redis message queue.
2. Redis-backed anti-spam rate limiting for `send_message` events.

Redis is optional. If `REDIS_URL` is not set, the app still runs with local in-memory fallback behavior.

### 1) Install dependencies

```bash
pip install -r requirements.txt
```

### 2) Add environment variables in `backend/.env`

```env
# Example for local Docker Redis
REDIS_URL=redis://localhost:6379/0

# Optional tuning (defaults shown)
MESSAGE_RATE_LIMIT_COUNT=8
MESSAGE_RATE_LIMIT_WINDOW_SECONDS=5
```

### 3) Run backend

```bash
python backend/app.py
```

If Redis is reachable, backend logs will include `Redis connection established.`
