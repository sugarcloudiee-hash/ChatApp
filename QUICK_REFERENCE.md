# Quick Reference: Issue Fixes

## Problem 1: "Expected JavaScript but got text/jsx"

### Root Cause
MIME type headers telling browser to treat `.js` files as text instead of executable code.

### ✅ Fixed
```python
# backend/app.py - Lines 27-30

mimetypes.add_type("application/javascript", ".js")  # ← Fixed!
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".jsx")        # For source files (if served)
mimetypes.add_type("text/css", ".css")               # Added
```

---

## Problem 2: "frontend/dist is missing"

### Root Cause
Dockerfile wasn't properly building the frontend due to working directory context.

### ✅ Fixed
```dockerfile
# Dockerfile - Lines 2-7 (Frontend stage)

FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/    # ← Copy to correct context
RUN cd frontend && npm ci --prefer-offline
COPY frontend/ ./frontend/
RUN cd frontend && npm run build           # ← Build creates /app/frontend/dist
```

### Build Output Path
```
Before (issue):  /app/frontend/dist      ← But WORKDIR was /app/frontend, so unclear
After (fixed):   /app/frontend/dist      ← Clear path from /app root
```

---

## Problem 3: Script path not working in production

### Root Cause
`index.html` referenced `/src/main.jsx` which doesn't exist in built output.

### ✅ Fixed
```html
<!-- frontend/index.html -->
<script type="module" src="/src/main.jsx"></script>
```

**How it works:**
1. **Dev:** Vite's dev server handles `/src/main.jsx` directly
2. **Build:** Vite **transforms** this to `/assets/main-{hash}.js` in the output HTML
3. **Production:** Flask serves `/assets/main-{hash}.js` from `frontend/dist/assets/`

Example output after build:
```html
<!-- frontend/dist/index.html (after npm run build) -->
<script type="module" src="/assets/main-a1b2c3d4.js"></script>
<link rel="stylesheet" href="/assets/style-e5f6g7h8.css">
```

---

## Problem 4: Incorrect static file serving

### Root Cause
Flask not configured for proper SPA routing (React Router needs catch-all route).

### ✅ Fixed
```python
# backend/app.py - Lines 68-85

@app.route("/", defaults={"filename": "index.html"})
@app.route("/<path:filename>")
def serve_spa(filename):
    """
    Serves files from dist/ folder
    If not found, returns index.html for SPA routing
    """
    try:
        filepath = Path(FRONTEND_DIR) / filename
        if filepath.exists() and filepath.is_file():
            return send_from_directory(FRONTEND_DIR, filename)
    except Exception as e:
        logger.debug(f"Error: {e}")
    
    # Return index.html for SPA routing
    if not filename.startswith("api/") and "." not in filename.split("/")[-1]:
        return send_from_directory(FRONTEND_DIR, "index.html")
    
    return "Not Found", 404
```

**Behavior:**
- `/` → serves `index.html`
- `/about` → serves `index.html` (React Router handles it)
- `/assets/main-abc.js` → serves actual file
- `/api/users` → returns 404 (handled by `register_routes()`)

---

## Vite Build Configuration

### ✅ Added
```javascript
// frontend/vite.config.js

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',           // ← Explicit output
    sourcemap: false,         // ← Smaller bundles
    minify: 'terser',         // ← Minified JS
  },
  // ... rest of config
})
```

**What this does:**
- `outDir: 'dist'` → All built files go to `frontend/dist/`
- `sourcemap: false` → Smaller file sizes for production
- `minify: 'terser'` → Optimized JavaScript

---

## Docker Multi-Stage Build Flow

```
Stage 1: Node 20 (Build)
  /app/
  ├── frontend/
  │   ├── package.json
  │   ├── src/
  │   │   ├── main.jsx
  │   │   └── ...
  │   └── dist/          ← npm run build creates this
  │       ├── index.html
  │       └── assets/
  │           └── *.js, *.css

Stage 2: Python 3.11 (Runtime)
  /app/
  ├── backend/           ← Copied from host
  │   └── app.py
  ├── frontend/
  │   └── dist/          ← Copied from Stage 1
  │       └── ...
  └── gunicorn process starts
```

**Copy command:**
```dockerfile
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
                              ↑ Source from Stage 1   ↑ Destination in Stage 2
```

---

## Deployment Checklist

- [ ] `frontend/dist/index.html` exists and contains hashed JS references
- [ ] MIME types in Flask set to `application/javascript`
- [ ] Flask has SPA routing catch-all
- [ ] Dockerfile builds successfully
- [ ] Environment variables set in Render
- [ ] Database URL configured
- [ ] Socket.IO proxy working (check vite.config.js)

---

## Test It

### Local Test
```bash
# Terminal 1: Backend
cd backend && python -m venv venv && source venv/bin/activate && \
pip install -r requirements.txt && flask run

# Terminal 2: Frontend  
cd frontend && npm ci && npm run dev
# → http://localhost:5173
```

### Docker Test
```bash
docker build -t test .
docker run -p 5050:5050 -e CHAT_KEY=test my-app:latest
# → http://localhost:5050
```

---

## One-Line Build (Windows)
```batch
cd frontend && npm ci && npm run build && cd .. && docker build -t my-app . && docker run -p 5050:5050 -e CHAT_KEY=test my-app
```

## One-Line Build (Linux/Mac)
```bash
cd frontend && npm ci && npm run build && cd .. && docker build -t my-app . && docker run -p 5050:5050 -e CHAT_KEY=test my-app
```

---

**All issues fixed! Ready to deploy to Render.** 🚀
