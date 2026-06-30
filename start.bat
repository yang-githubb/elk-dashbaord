@echo off
title SMT Board Dashboard
cd /d "%~dp0"

echo Starting dashboard server...
start "ELK Dashboard" /min python "%~dp0proxy.py"
timeout /t 2 /nobreak >nul

echo Opening http://127.0.0.1:8000/
start "" "http://127.0.0.1:8000/"
exit /b 0
