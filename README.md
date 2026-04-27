# ChatApp
Chat app

## Render Deployment

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

For now, you can run the party queue without Redis by setting:

- `PARTY_QUEUE_BACKEND=memory`

Backend modes:

- `memory`: always use in-process memory
- `auto` (default): use Redis only when available (`REDIS_URL` + redis client)
- `redis`: prefer Redis, fallback to memory when Redis is unavailable
