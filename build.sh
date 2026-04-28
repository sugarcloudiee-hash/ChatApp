#!/bin/bash
# Full-stack build and test script for local development and Docker testing

set -e

echo "=========================================="
echo "   Full-Stack Build & Test Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_step() {
    echo -e "${YELLOW}→${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# ========== STEP 1: Build Frontend ==========
log_step "Building frontend..."
if [ ! -d "frontend" ]; then
    log_error "frontend/ directory not found. Run from project root."
fi

cd frontend
if [ ! -d "node_modules" ]; then
    log_step "Installing frontend dependencies..."
    npm ci --prefer-offline || log_error "npm install failed"
fi

npm run build || log_error "Frontend build failed"

if [ ! -d "dist" ]; then
    log_error "frontend/dist/ not created. Build failed."
fi

# Verify key files exist
if [ ! -f "dist/index.html" ]; then
    log_error "dist/index.html not found after build"
fi

log_success "Frontend built successfully"
log_success "Output: frontend/dist/"
cd ..

# ========== STEP 2: Verify Backend ==========
log_step "Checking backend..."
if [ ! -d "backend" ]; then
    log_error "backend/ directory not found"
fi

if [ ! -f "backend/app.py" ]; then
    log_error "backend/app.py not found"
fi

if [ ! -f "backend/requirements.txt" ]; then
    log_error "backend/requirements.txt not found"
fi

log_success "Backend files verified"

# ========== STEP 3: Check Dockerfile ==========
log_step "Verifying Dockerfile..."
if [ ! -f "Dockerfile" ]; then
    log_error "Dockerfile not found"
fi

log_success "Dockerfile exists"

# ========== STEP 4: Build Docker Image ==========
log_step "Building Docker image..."
if ! command -v docker &> /dev/null; then
    echo "${YELLOW}⚠${NC} Docker not found. Skipping Docker build."
    echo "   Install Docker from https://www.docker.com/products/docker-desktop"
else
    docker build -t my-app:latest . || log_error "Docker build failed"
    log_success "Docker image built: my-app:latest"
fi

# ========== STEP 5: Test Locally (Optional) ==========
echo ""
echo -e "${YELLOW}→${NC} Local testing options:"
echo ""
echo "  A) Test Flask + Frontend locally:"
echo "     1. Backend: cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && flask run"
echo "     2. Frontend: cd frontend && npm run dev"
echo "     3. Visit: http://localhost:5173"
echo ""
echo "  B) Test Docker container:"
if command -v docker &> /dev/null; then
    echo "     docker run -p 5050:5050 -e CHAT_KEY=test-key my-app:latest"
    echo "     Then visit: http://localhost:5050"
else
    echo "     (Docker not available)"
fi
echo ""

# ========== STEP 6: Deployment Instructions ==========
echo ""
echo -e "${GREEN}=========================================="
echo "   Deployment Checklist"
echo "==========================================${NC}"
echo ""
echo "✓ Frontend built to frontend/dist/"
echo "✓ Backend files verified"
echo "✓ Dockerfile ready"
if command -v docker &> /dev/null; then
    echo "✓ Docker image built"
fi
echo ""
echo "Next steps:"
echo "  1. Commit changes: git add . && git commit -m 'Fix frontend/backend integration'"
echo "  2. Push to Git: git push origin main"
echo "  3. Render auto-deploys from render.yaml"
echo ""
echo "See DEPLOYMENT_GUIDE.md for detailed instructions."
echo ""
