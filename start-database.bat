@echo off
title DeliveryFlow - Local Data Store
cd /d "%~dp0"
echo ==========================================
echo   DeliveryFlow - Local Data Store
echo ==========================================
echo.
echo This version stores app data in data\store.json.
echo No MySQL, Redis, Docker, or database setup is required.
echo The data file is created automatically on first run.
echo.
echo Start the app with:
echo   npm start
echo.
echo Then open http://localhost:4000
pause
