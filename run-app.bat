@echo off
title DeliveryFlow - Server Launcher
cd /d "%~dp0"
echo ==========================================
echo   DeliveryFlow - CRM to Project Delivery
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 18 or newer is required.
  echo Install Node.js from https://nodejs.org/
  pause
  exit /b 1
)
node --version
echo Open http://localhost:4000
echo Press Ctrl+C to stop.
npm start
pause
