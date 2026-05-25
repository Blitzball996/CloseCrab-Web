@echo off
title Kill CloseCrab Process
echo.
echo   Stopping CloseCrab-Unified...
echo   ─────────────────────────────
echo.

taskkill /F /IM closecrab-unified.exe >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] closecrab-unified.exe has been terminated.
) else (
    echo   [--] closecrab-unified.exe is not running.
)

echo.
pause
