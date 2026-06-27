@echo off
setlocal

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Content Ops quick start
echo Project: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Please install Node.js 20 or newer.
    goto :fail
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found. Please install Node.js 20 or newer.
    goto :fail
)

if not exist "node_modules\" (
    echo [INFO] node_modules not found. Running npm install...
    call npm.cmd install
    if errorlevel 1 goto :fail
    echo.
)

if not exist "prisma\dev.db" (
    echo [INFO] prisma\dev.db not found. Running npm run prepare:db...
    call npm.cmd run prepare:db
    if errorlevel 1 goto :fail
    echo.
)

echo [INFO] Starting development server...
echo [INFO] Open http://localhost:3100 after startup finishes.
echo [INFO] Press Ctrl+C to stop.
echo.

call npm.cmd run dev
if errorlevel 1 goto :fail

echo.
echo [INFO] Server stopped.
goto :end

:fail
echo.
echo [ERROR] Quick start failed. Check the messages above.
pause
exit /b 1

:end
echo.
pause
endlocal
