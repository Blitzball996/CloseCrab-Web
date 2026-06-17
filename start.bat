@echo off
chcp 65001 > nul
title CloseCrab-Web
echo.
echo   CloseCrab-Web - Remote Control
echo   ================================
echo.

cd /d "%~dp0"

:: Check node
where node >nul 2>nul
if errorlevel 1 (
    echo   [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Run the web server in the FOREGROUND on port 8787 (3000 is often taken by
:: Epic Games / other apps). The server auto-starts the cloudflared tunnel and
:: prints the Token + the public trycloudflare.com URL right here in this window.
echo   Starting web server (token + remote URL will print below)...
echo.
node bin/cli.js --port 8787

echo.
echo   Server stopped. Press any key to close.
pause >nul
