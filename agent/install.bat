@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ===================================================
echo   CloudPrint Headless Agent - One-Click Setup
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this system.
    echo Node.js (version 18+) is required to run the headless agent.
    echo.
    echo Opening the Node.js download page in your browser...
    start https://nodejs.org/en/download/
    echo Please install Node.js and run this setup script again.
    echo.
    pause
    exit /b 1
)

:: 2. Check if node_modules exists, if not run npm install
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies (npm install)...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo ✓ Dependencies installed successfully.
    echo.
)

:: 3. Check if .env configuration file exists. If not, prompt the user to configure it.
if not exist ".env" (
    echo [INFO] Configuration file (.env) not found. Let's set it up now.
    echo.
    set /p AGENT_ID="Enter a unique Agent ID (e.g. office-printer-1): "
    set /p WS_URL="Enter the Server WebSocket URL (e.g. wss://yourdomain.com/ws): "
    set /p WS_SECRET="Enter the Webhook/WS Secret: "
    set /p PRINTER_NAME="(Optional) Enter target printer name (leave blank for default): "
    
    echo # CloudPrint Agent Configuration > .env
    echo AGENT_ID=!AGENT_ID!>> .env
    echo WS_URL=!WS_URL!>> .env
    echo WS_SECRET=!WS_SECRET!>> .env
    echo PRINTER_NAME=!PRINTER_NAME!>> .env
    echo ✓ Configuration file (.env) created successfully.
    echo.
)

:: 4. Run the startup installer script
echo [INFO] Registering startup tasks...
node install-startup.js

if %errorlevel% equ 0 (
    echo.
    echo ===================================================
    echo ✓ Setup Complete!
    echo The agent is now running silently in the background
    echo and will start automatically when Windows boots.
    echo ===================================================
) else (
    echo.
    echo [ERROR] Setup failed during registration.
)

echo.
pause

