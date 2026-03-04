@echo off
echo ============================================
echo ChunkSmith - Smart Run (Backend and Frontend)
echo ============================================
echo.

set BACKEND_IMAGE=anshulnp/chunksmith-app:backend
set FRONTEND_IMAGE=anshulnp/chunksmith-app:frontend

:: Check and Pull Backend Image
echo Checking for Backend image...
docker image inspect %BACKEND_IMAGE% >nul 2>&1
if errorlevel 1 (
    echo [MISSING] Backend image not found locally. Pulling from Docker Hub...
    docker pull %BACKEND_IMAGE%
) else (
    echo [FOUND] Backend image found locally. Skipping pull.
)

echo.

:: Check and Pull Frontend Image
echo Checking for Frontend image...
docker image inspect %FRONTEND_IMAGE% >nul 2>&1
if errorlevel 1 (
    echo [MISSING] Frontend image not found locally. Pulling from Docker Hub...
    docker pull %FRONTEND_IMAGE%
) else (
    echo [FOUND] Frontend image found locally. Skipping pull.
)

echo.
echo Stopping old containers...
docker-compose down

echo.
echo Starting containers...
docker-compose up -d

echo.
echo Waiting for services to start...
timeout /t 5 >nul

echo.
echo Opening App in Browser...
start https://chunksmith.onrender.com

echo.
echo ============================================
echo App is running at https://chunksmith.onrender.com
echo Backend API at https://chunksmith.onrender.com
echo ============================================
pause
