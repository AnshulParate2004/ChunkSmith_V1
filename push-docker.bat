@echo off
echo ============================================
echo 🚀 ChunkSmith - Build and Push (Unified)
echo ============================================
echo.

docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running
    pause
    exit /b 1
)

set DOCKER_USERNAME=anshulnp

echo.
echo 🔨 Building Unified Image (anshulnp/chunksmith-backend)...
docker build -t %DOCKER_USERNAME%/chunksmith-backend:latest -f Backend/Dockerfile .

if errorlevel 1 (
    echo ❌ Build failed
    pause
    exit /b 1
)

echo.
echo 📤 Pushing Image...
docker push %DOCKER_USERNAME%/chunksmith-backend:latest

if errorlevel 1 (
    echo ❌ Push failed
    pause
    exit /b 1
)

echo.
echo ============================================
echo ✅ SUCCESS! All done.
echo ============================================
echo.
pause
