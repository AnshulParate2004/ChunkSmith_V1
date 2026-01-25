@echo off
echo ============================================
echo ChunkSmith - Build and Push App (Backend and Frontend)
echo ============================================
echo.

docker info >nul 2>&1
if errorlevel 1 (
    echo Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

set DOCKER_USERNAME=anshulnp
set APP_REPO=chunksmith-app

echo.
echo Building Backend Image (%DOCKER_USERNAME%/%APP_REPO%:backend)...
docker build -t %DOCKER_USERNAME%/%APP_REPO%:backend -f Backend/Dockerfile .
if errorlevel 1 goto error

echo.
echo Building Frontend Image (%DOCKER_USERNAME%/%APP_REPO%:frontend)...
docker build -t %DOCKER_USERNAME%/%APP_REPO%:frontend -f Frontend/Dockerfile Frontend/
if errorlevel 1 goto error

echo.
echo Pushing Backend Image...
docker push %DOCKER_USERNAME%/%APP_REPO%:backend
if errorlevel 1 goto error

echo.
echo Pushing Frontend Image...
docker push %DOCKER_USERNAME%/%APP_REPO%:frontend
if errorlevel 1 goto error

echo.
echo ============================================
echo SUCCESS: Both backend and frontend pushed to %DOCKER_USERNAME%/%APP_REPO%
echo ============================================
echo.
pause
exit /b 0

:error
echo.
echo ERROR: An error occurred during the process.
pause
exit /b 1
