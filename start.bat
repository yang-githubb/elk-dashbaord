@echo off
title SMT Machines Dashboard
cd /d "%~dp0"

if not exist "config.js" (
    echo [setup] config.js not found — creating from config.example.js
    copy /Y "config.example.js" "config.js" >nul
    echo.
    echo Edit config.js with your Elasticsearch credentials, save, then run start.bat again.
    notepad "config.js"
    pause
    exit /b 1
)

if not exist "index.html" (
    echo [error] index.html not found in %~dp0
    pause
    exit /b 1
)

echo Opening dashboard in your default browser...
echo Folder: %~dp0
start "" "%~dp0index.html"
exit /b 0
