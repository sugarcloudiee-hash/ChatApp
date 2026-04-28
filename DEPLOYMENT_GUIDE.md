# Full-Stack Deployment Guide

## ✅ Architecture Overview

```
┌─────────────────┐
│  React + Vite   │  → Builds to `frontend/dist/`
│    Frontend     │
└────────┬────────┘
         │
         │ npm run build
         │ (Creates hashed bundles)
         │
    ┌────▼─────┐
    │  Flask   │  ← Serves dist/ + API routes
    │ Backend  │
    └──────────┘
```

### Why This Works
1. **Vite builds React** → Transforms JSX to optimized JS bundles with hashing
2. **Flask serves the dist folder** → Handles static files + SPA routing
3. **MIME types are correct** → .js files served as `application/javascript`
4. **Single deployment** → One Docker image contains both frontend & backend

---

## 🚀 Local Development

### Prerequisites
- Node.js 20+
- Python 3.11+
- pip & npm

### Start Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
flask run --port 5050
```

### Start Frontend (separate terminal)
```bash
cd frontend
npm ci
npm run dev    # Runs on http://localhost:5173
```

**Dev server proxies API calls** to `http://127.0.0.1:5050` (see vite.config.js)

---

## 🛠️ Build Commands

### Build Frontend (Creates `frontend/dist/`)
```bash
cd frontend
npm ci
npm run build
```

**Output:**
- `frontend/dist/index.html` (main entry point)
- `frontend/dist/assets/` (hashed .js, .css bundles)
- `frontend/dist/favicon.svg` (if exists)

### Build Docker Image
```bash
docker build -t my-app:latest .
```

**Docker Build Process:**
1. **Stage 1 (Node 20):** Builds React → creates `frontend/dist/`
2. **Stage 2 (Python 3.11):** Copies dist + backend code + dependencies
3. **Result:** Single image ready to deploy

### Test Locally
```bash
docker run -p 5050:5050 \
  -e DATABASE_URL="sqlite:///data.db" \
  -e CHAT_KEY="test-key" \
  my-app:latest
```
Then visit `http://localhost:5050`

---

## 🚢 Deployment on Render

### 1. Push to Git
```bash
git add .
git commit -m "Fix frontend/backend integration"
git push origin main
```

### 2. Render Configuration (render.yaml)

```yaml
services:
  - type: web
    name: chat-backend
    runtime: docker
    region: oregon
    plan: starter
    autoDeploy: true
    envVars:
      - key: PORT
        value: 5050
      - key: DATABASE_URL
        value: postgresql://...  # Your DB URL
      - key: CHAT_KEY
        value: your-secret-key
      - key: SUPABASE_URL
        value: your-supabase-url
      - key: SUPABASE_SERVICE_ROLE_KEY
        value: your-service-key
```

### 3. Environment Variables on Render

Set these in Render Dashboard → Environment:
- `DATABASE_URL` - PostgreSQL or SQLite connection
- `CHAT_KEY` - Secret key for session management
- `SUPABASE_*` - If using Supabase

### 4. Render Deploy Steps

Render automatically:
1. Detects `Dockerfile`
2. Runs Docker build → builds frontend + backend
3. Starts with: `gunicorn -w 1 -k eventlet -b 0.0.0.0:5050 backend.app:app`
4. Serves on `https://your-app.onrender.com`

---

## 📋 Troubleshooting

### ❌ Error: "frontend/dist is missing"
**Cause:** Frontend build didn't run or failed

**Fix:**
```bash
cd frontend
npm ci
npm run build
# Verify frontend/dist/ exists
ls frontend/dist/
```

### ❌ Error: "Expected JavaScript but got text/jsx"
**Cause:** MIME type misconfiguration

**Status:** ✅ FIXED in Flask app.py:
```python
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
```

### ❌ Error: "Blank page / 404 on routes"
**Cause:** SPA routing not working

**Status:** ✅ FIXED in Flask app.py - catch-all route serves `index.html` for non-API paths

### ❌ Error: "Socket.IO connection failed"
**Cause:** WebSocket proxy not configured

**Status:** Already configured in vite.config.js for dev. Production uses same origin.

---

## 📁 Folder Structure (After Build)

### Development
```
frontend/
├── dist/                     (empty until npm run build)
├── src/
│   ├── main.jsx             (entry point)
│   ├── App.jsx
│   └── ...
├── package.json
├── vite.config.js
└── index.html              (Vite injects entry point here)

backend/
├── app.py                  (Flask app with SPA routing)
├── config.py               (points to frontend/dist)
├── requirements.txt
└── ...
```

### Production (After Docker build)
```
/app/
├── backend/
│   ├── app.py
│   ├── config.py
│   └── ...
├── frontend/
│   └── dist/
│       ├── index.html          (Entry point)
│       ├── favicon.svg
│       └── assets/
│           ├── main-abc123.js  (Hashed)
│           ├── style-def456.css
│           └── ...
```

---

## 🔗 Key Files Modified

| File | Change | Why |
|------|--------|-----|
| `frontend/index.html` | Script path: `/src/main.jsx` | Vite transforms during build |
| `frontend/vite.config.js` | Added `build.outDir: 'dist'` | Explicit output configuration |
| `backend/app.py` | Added SPA routing + MIME types | Serve dist/ properly |
| `Dockerfile` | Fixed frontend build stage | Correct path context |

---

## 🎯 Quick Checklist

- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] `frontend/dist/` folder exists with `index.html`
- [ ] `backend/app.py` has SPA routing (catch-all route)
- [ ] MIME types set to `application/javascript` for `.js`
- [ ] Docker builds successfully: `docker build -t test .`
- [ ] `render.yaml` configured with env vars
- [ ] Git pushed to main branch
- [ ] Render auto-deploys and logs show no errors

---

## 📚 References

- [Vite Documentation](https://vite.dev/)
- [Vite Build Configuration](https://vite.dev/config/build)
- [Flask Static Files](https://flask.palletsprojects.com/en/latest/quickstart/#static-files)
- [Render Deployment](https://docs.render.com/)
