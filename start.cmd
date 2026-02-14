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
echo [1/3] Installing backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt -q 2>nul

:: Install frontend deps
echo [2/3] Installing frontend dependencies...
cd /d "%~dp0frontend"
if not exist node_modules (
    call npm install
) else (
    echo       (already installed)
)

:: Install root deps (Electron)
cd /d "%~dp0"
if not exist node_modules (
    call npm install
) else (
    echo       (already installed)
)

:: Launch Electron (it starts backend + frontend automatically)
echo [3/3] Launching SpaghettiMap...
echo.
echo    Electron will start backend + frontend dev server.
echo    Please wait for the window to appear...
echo.
npx electron .
