@echo off
title SpaghettiMap IDE
color 0A

echo ============================================
echo    SpaghettiMap IDE - Starting...
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install from python.org
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

:: Install backend deps
echo [1/5] Backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt -q 2>nul

:: Install frontend deps (CRITICAL - vite needs this)
echo [2/5] Frontend dependencies...
cd /d "%~dp0frontend"
call npm install --silent

:: Install root deps (Electron)
echo [3/5] Electron dependencies...
cd /d "%~dp0"
call npm install --silent

:: Start backend in background
echo [4/5] Starting backend server...
cd /d "%~dp0backend"
start /B python -m uvicorn main:app --port 8000

:: Start frontend in background
echo [5/5] Starting frontend dev server...
cd /d "%~dp0frontend"
start /B npx vite

:: Wait for frontend to be ready
echo.
echo    Waiting for servers to start...
timeout /t 5 /nobreak >nul

:: Launch Electron
echo.
echo    Launching SpaghettiMap IDE...
echo    (Close this window to stop all services)
echo.
cd /d "%~dp0"
npx electron .
