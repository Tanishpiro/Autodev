@echo off
title DeliveryFlow - MySQL Database Starter
echo ========================================================
echo   DeliveryFlow - MySQL Workbench Database Connector
echo ========================================================
echo.

echo [1/2] Attempting to start MySQL via Docker...
docker compose up -d mysql redis
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] MySQL is running on localhost:3306!
    echo You can open MySQL Workbench and connect to:
    echo   Host: localhost
    echo   Port: 3306
    echo   User: root
    echo   Password: root
    echo.
    echo [2/2] Seeding initial data...
    npm run seed
    echo.
    echo ========================================================
    echo   Database connected and ready!
    echo   You can now run: npm start
    echo ========================================================
) else (
    echo.
    echo [INFO] Docker not detected.
    echo [INFO] If you have MySQL Workbench installed:
    echo        1. Start your local MySQL Server in MySQL Workbench
    echo        2. Run: npm run seed
    echo.
    echo [INFO] Note: If MySQL is not running, DeliveryFlow will
    echo        automatically use its built-in database (backend/data/db.json)
    echo        so your app continues working smoothly!
    echo.
    echo You can start the app right now with:
    echo   npm start
    echo ========================================================
)
pause
