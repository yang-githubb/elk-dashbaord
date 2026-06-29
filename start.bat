@echo off
title SMT Board Dashboard
cd /d "%~dp0"

if not exist "config.js" (
    if exist "config.example.js" (
        echo [setup] Creating config.js from config.example.js
        copy /Y "config.example.js" "config.js" >nul
    ) else (
        echo [error] config.js not found
        pause
        exit /b 1
    )
)

echo Starting dashboard server...
start "ELK Dashboard" /min python "%~dp0proxy.py"
timeout /t 2 /nobreak >nul

echo Opening http://127.0.0.1:8000/
start "" "http://127.0.0.1:8000/"
exit /b 0
