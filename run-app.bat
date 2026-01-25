@echo off
echo ============================================
echo ChunkSmith - Clean Run (Backend and Frontend)
echo ============================================
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
start http://localhost

echo.
echo ============================================
echo App is running at http://localhost
echo Backend API at http://localhost:8000
echo ============================================
pause
