# Deployment Architecture Diagram

## 🏗️ Full-Stack Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT BROWSER                             │
│                                                                 │
│  User navigates to: https://chat.onrender.com/                 │
│  ↓                                                              │
│  GET / ────────────────────────────────────────→               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 RENDER CLOUD (Docker)                          │
│                                                                 │
│  Port 5050: gunicorn -w 1 -k eventlet ...                      │
│  ↓                                                              │
│  Flask App (backend/app.py)                                     │
│  ├─ Line 1: Check if path is /api/* or /socket.io → Route     │
│  ├─ Line 2: Check if file exists in frontend/dist → Serve     │
│  └─ Line 3: Return index.html for SPA routing                  │
│      ↓                                                          │
│      Serves: frontend/dist/index.html                          │
│              + MIME type: text/html                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER (receives HTML)                    │
│                                                                 │
│  <html>                                                         │
│    <script src="/assets/main-{hash}.js"></script>             │
│  </html>                                                        │
│  ↓                                                              │
│  GET /assets/main-{hash}.js ────────────────────→              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Flask Serves Asset Files                      │
│                                                                 │
│  ✓ Found: frontend/dist/assets/main-{hash}.js                 │
│  ✓ MIME type: application/javascript                          │
│  ✓ Status: 200 OK                                             │
│                                                                 │
│  Response:                                                     │
│  ├─ Header: Content-Type: application/javascript              │
│  └─ Body: (minified React bundle code)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                Browser Executes React App                      │
│                                                                 │
│  ✓ Loads React bundle (main-{hash}.js)                        │
│  ✓ Hydrates root element                                       │
│  ✓ React Router takes over routing                             │
│                                                                 │
│  User clicks /chat/room-123:                                   │
│  ↓ (No page reload)                                            │
│  GET /socket.io ────────────────────────→ (WebSocket)         │
│  GET /me ─────────────────────────→ (API)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Docker Build Process

```
┌──────────────────────────────────────┐
│  Host: git clone + git push          │
│  ↓                                   │
│  repo/                               │
│  ├── frontend/                       │
│  │   ├── src/main.jsx                │
│  │   ├── index.html                  │
│  │   └── package.json                │
│  ├── backend/                        │
│  │   ├── app.py                      │
│  │   └── requirements.txt            │
│  └── Dockerfile                      │
└──────────────────────────────────────┘
            │
            ↓ docker build
┌──────────────────────────────────────┐
│  STAGE 1: Node 20 Alpine             │
│  WORKDIR: /app                       │
│  ├── COPY frontend/package*.json     │
│  ├── npm ci                          │
│  ├── COPY frontend/ ./frontend/      │
│  ├── npm run build                   │
│  │   ├─ Vite transforms JSX          │
│  │   ├─ Creates hashed bundles       │
│  │   └─ Output: /app/frontend/dist/  │
│  └─ Files ready for copying          │
└──────────────────────────────────────┘
            │
            ↓ COPY --from=frontend-builder
┌──────────────────────────────────────┐
│  STAGE 2: Python 3.11 Slim           │
│  WORKDIR: /app                       │
│  ├── COPY requirements.txt           │
│  ├── pip install -r requirements.txt │
│  ├── COPY backend/ ./backend/        │
│  ├── COPY frontend/dist/ ./frontend/ │
│  │       dist/                       │
│  │   └── index.html                  │
│  │       assets/                     │
│  │       ├── main-{hash}.js         │
│  │       └── style-{hash}.css       │
│  └─ EXPOSE 5050                      │
│     CMD: gunicorn backend.app:app    │
└──────────────────────────────────────┘
            │
            ↓ docker push (to Render)
┌──────────────────────────────────────┐
│  Render Cloud Container              │
│  ├── Running on port 5050            │
│  ├── /app/backend/                   │
│  ├── /app/frontend/dist/             │
│  └── gunicorn serving both           │
└──────────────────────────────────────┘
```

---

## 🔄 Request Flow Diagram

### Development (npm run dev)
```
Browser (localhost:5173)
    ↓
Vite Dev Server (port 5173)
    ├─ /src/main.jsx → serves directly (HMR enabled)
    ├─ /socket.io → proxy to localhost:5050
    ├─ /api/* → proxy to localhost:5050
    └─ /me → proxy to localhost:5050
    ↓
Flask Backend (localhost:5050)
    └─ returns JSON
```

### Production (after docker build + deploy)
```
Browser (app.onrender.com)
    ↓
Request: GET / (or any non-API route)
    ↓
Flask App (Gunicorn on port 5050)
    ├─ Check: Is /assets/...? → Serve file with correct MIME
    ├─ Check: Is /api/...? → Handle with API route
    └─ Otherwise → Serve index.html (SPA routing)
    ↓
Browser receives:
├─ index.html + MIME: text/html
├─ /assets/main-abc.js + MIME: application/javascript ✓
├─ /assets/style-def.css + MIME: text/css ✓
└─ React loads and handles routing
```

---

## 🎯 Key Fix Connections

```
Problem                          Root Cause                  Fix Location
────────────────────────────────────────────────────────────────────────

❌ "Expected JS got text/jsx"    MIME type wrong            backend/app.py
                                 .js → text/plain            (line 28)
                                 
❌ "frontend/dist missing"       Docker build context       Dockerfile
                                 working dir confusion       (line 2-6)
                                 
❌ Blank page / 404              No SPA routing             backend/app.py
                                 Flask returns 404           (line 68-85)
                                 
❌ Script src="/src/main.jsx"    Not transformed            frontend/vite.config.js
   in production                 in production              (added build config)
                                 
❌ Socket.IO not proxied         Dev proxy only             vite.config.js
   in production                 (already configured ✓)     (already correct)
```

---

## 📊 Vite Build Transformation

```
Input (before build):
────────────────────
frontend/index.html:
  <script type="module" src="/src/main.jsx"></script>

frontend/src/main.jsx:
  import React from 'react'
  import { App } from './App'
  
  ReactDOM.createRoot(...)


Output (after npm run build):
──────────────────────────────
frontend/dist/index.html:
  <script type="module" src="/assets/main-abc123.js"></script>
  <link rel="stylesheet" href="/assets/main-def456.css">

frontend/dist/assets/main-abc123.js:
  (entire React app minified + bundled)
  
frontend/dist/assets/main-def456.css:
  (all CSS bundled + minified)
```

---

## 🔐 Security & Performance

```
Before Fix                          After Fix
──────────────────────────────────────────────
Served JSX as text/plain    ✗      Served JS as application/javascript ✓
No minification              ✗      Terser minification enabled ✓
Source maps for users       ✗      Disabled in production ✓
Hardcoded src paths         ✗      Vite manages hashing ✓
No CORS headers             ✗      CORS headers configured ✓
No SPA routing              ✗      Catch-all index.html route ✓
```

---

## 🚀 Deployment Timeline

```
t=0:   git push origin main
       ↓
t=2min: Render webhook triggered
        ├─ Detects Dockerfile
        └─ Starts docker build
       ↓
t=3min: Stage 1 (Node) runs npm build
        ├─ Vite transforms JSX
        └─ Creates hashed bundles
       ↓
t=5min: Stage 2 (Python) installs deps
        └─ Copies dist/ from Stage 1
       ↓
t=6min: Docker image complete
        └─ Pushed to Render
       ↓
t=7min: Container starts
        ├─ gunicorn spawns
        └─ Listening on port 5050
       ↓
t=8min: Status: Running ✓
        Visit: https://app.onrender.com/
```

---

## 🧪 Test Flow

```
Local Development               Docker Test                  Production
─────────────────────────────────────────────────────────────────────

flask run (5050)         →     docker build              →    Render
npm run dev (5173)       →     docker run (5050)          →    Kubernetes
                               curl localhost:5050         →    Load Balancer
                                                           →    App URL
                                                           
Dev Vite server:         →     Production Flask:         →    Production Flask:
- Hot reload            →     - Static file serve       →    - CDN cache
- Source maps           →     - No source maps          →    - Minimal files
- Dev tools             →     - Minified                →    - Security headers
```

---

**This architecture ensures:**
✅ Correct MIME types  
✅ Proper SPA routing  
✅ Production-ready bundling  
✅ Fast deployment  
✅ Scalable architecture
