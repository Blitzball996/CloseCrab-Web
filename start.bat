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

:: Start web server in background
echo   Starting web server...
start /b node bin/cli.js --port 3000

:: Wait for server to be ready
timeout /t 3 /nobreak >nul

:: Find cloudflared
set CF_EXE=
if exist "G:\CMakePJ\CloseCrab-Unified\build\Release\cloudflared.exe" (
    set CF_EXE=G:\CMakePJ\CloseCrab-Unified\build\Release\cloudflared.exe
)
if exist "%~dp0cloudflared.exe" (
    set CF_EXE=%~dp0cloudflared.exe
)
if exist "C:\Program Files\CloseCrab-Unified\cloudflared.exe" (
    set CF_EXE=C:\Program Files\CloseCrab-Unified\cloudflared.exe
)

echo.
echo   Local:  http://localhost:3000
echo.

if "%CF_EXE%"=="" (
    echo   [NOTE] cloudflared not found - only LAN access available.
    echo   For remote access, place cloudflared.exe in this folder.
    echo.
    echo   Press Ctrl+C to stop.
    pause >nul
) else (
    echo   Starting tunnel for remote access...
    echo.
    "%CF_EXE%" tunnel --url http://localhost:3000 2>&1 | findstr /C:"trycloudflare.com"
    echo.
    echo   Share the URL above with your phone!
    echo   Press Ctrl+C to stop.
    pause >nul
)
