@echo off
echo Starting CloseCrab-Web...
echo.

cd /d "%~dp0"
node bin/cli.js %*

if errorlevel 1 (
    echo.
    echo Failed to start. Make sure Node.js ^>=18 is installed.
    echo Run: npm install
    pause
)
