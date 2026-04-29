# ChatApp

Chat app with Flask + Socket.IO backend and React frontend.

## Redis Support

This project supports Redis for two main features:

1. Socket.IO scaling across multiple backend instances via a Redis message queue.
2. Redis-backed anti-spam rate limiting for `send_message` events.

Redis is optional. If `REDIS_URL` is not set the app still runs with local in-memory fallbacks.

## Quick start (local)

1) Install Python dependencies

```bash
pip install -r requirements.txt
```

2) Add environment variables in `backend/.env` (example)

```env
# Example for local Docker Redis
REDIS_URL=redis://localhost:6379/0

# Optional tuning (defaults shown)
MESSAGE_RATE_LIMIT_COUNT=8
MESSAGE_RATE_LIMIT_WINDOW_SECONDS=5
```

3) Run backend

```bash
python backend/app.py
```

If Redis is reachable, backend logs will include `Redis connection established.`

## Render / Production deployment

Use these settings for the backend web service:

- Build command: `pip install -r requirements.txt && cd frontend && npm ci && npm run build && cd ..`
- Start command: `gunicorn -w 1 -k eventlet backend.app:app`

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended environment variables:

- `PARTY_QUEUE_BACKEND=memory` (run queue without Redis)
- `CORS_ORIGINS=https://your-frontend-domain.com`

Notes:

- The app serves frontend files from `frontend/dist` in production.
- If `frontend/dist` is missing, startup intentionally fails to avoid broken JSX MIME responses.

## Party Queue Backend (No Redis)

Run the party queue without Redis by setting:

- `PARTY_QUEUE_BACKEND=memory`

Backend modes:

- `memory`: always use in-process memory
- `auto` (default): use Redis only when available (`REDIS_URL` + redis client)
- `redis`: prefer Redis, fallback to memory when Redis is unavailable
