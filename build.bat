@echo off
REM Full-stack build and test script for Windows

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo    Full-Stack Build Test Script
echo ==========================================
echo.

REM ========== STEP 1: Build Frontend ==========
echo [1/5] Building frontend...
if not exist "frontend" (
    echo ERROR: frontend\ directory not found. Run from project root.
    exit /b 1
)

cd frontend
if not exist "node_modules" (
    echo [*] Installing frontend dependencies...
    call npm ci --prefer-offline
    if !errorlevel! neq 0 (
        echo ERROR: npm install failed
        exit /b 1
    )
)

call npm run build
if !errorlevel! neq 0 (
    echo ERROR: Frontend build failed
    exit /b 1
)

if not exist "dist" (
    echo ERROR: frontend\dist\ not created. Build failed.
    exit /b 1
)

if not exist "dist\index.html" (
    echo ERROR: dist\index.html not found after build
    exit /b 1
)

echo [OK] Frontend built successfully
echo [OK] Output: frontend\dist\
cd ..

REM ========== STEP 2: Verify Backend ==========
echo.
echo [2/5] Checking backend...
if not exist "backend" (
    echo ERROR: backend\ directory not found
    exit /b 1
)

if not exist "backend\app.py" (
    echo ERROR: backend\app.py not found
    exit /b 1
)

if not exist "backend\requirements.txt" (
    echo ERROR: backend\requirements.txt not found
    exit /b 1
)

echo [OK] Backend files verified

REM ========== STEP 3: Check Dockerfile ==========
echo.
echo [3/5] Verifying Dockerfile...
if not exist "Dockerfile" (
    echo ERROR: Dockerfile not found
    exit /b 1
)

echo [OK] Dockerfile exists

REM ========== STEP 4: Build Docker Image ==========
echo.
echo [4/5] Building Docker image...
where docker >nul 2>nul
if !errorlevel! neq 0 (
    echo [SKIP] Docker not found. Install from https://www.docker.com/products/docker-desktop
) else (
    call docker build -t my-app:latest .
    if !errorlevel! neq 0 (
        echo ERROR: Docker build failed
        exit /b 1
    )
    echo [OK] Docker image built: my-app:latest
)

REM ========== STEP 5: Summary ==========
echo.
echo ==========================================
echo    Deployment Checklist
echo ==========================================
echo.
echo [OK] Frontend built to frontend\dist\
echo [OK] Backend files verified
echo [OK] Dockerfile ready
where docker >nul 2>nul
if !errorlevel! equ 0 (
    echo [OK] Docker image built
)
echo.
echo Next steps:
echo   1. Commit changes: git add . ^&^& git commit -m "Fix frontend/backend integration"
echo   2. Push to Git: git push origin main
echo   3. Render auto-deploys from render.yaml
echo.
echo See DEPLOYMENT_GUIDE.md for detailed instructions.
echo.

REM ========== STEP 6: Testing Instructions ==========
echo Local testing options:
echo.
echo   A) Test Flask + Frontend locally:
echo      1. Backend: cd backend ^&^& python -m venv venv ^&^& venv\Scripts\activate ^&^& pip install -r requirements.txt ^&^& flask run
echo      2. Frontend: cd frontend ^&^& npm run dev  
echo      3. Visit: http://localhost:5173
echo.
where docker >nul 2>nul
if !errorlevel! equ 0 (
    echo   B) Test Docker container:
    echo      docker run -p 5050:5050 -e CHAT_KEY=test-key my-app:latest
    echo      Then visit: http://localhost:5050
) else (
    echo   B) Docker not available - install Docker Desktop
)
echo.

endlocal
