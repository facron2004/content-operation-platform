@echo off
setlocal
title Content Ops Platform

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================
echo   Content Ops Platform - Quick Start
echo ============================================
echo Project: %CD%
echo.

REM ---- Check Node.js ----
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 20+.
    goto :fail
)
echo [OK] Node.js:
node -v

REM ---- Detect package manager ----
set PM=npm.cmd
where pnpm.cmd >nul 2>nul
if not errorlevel 1 (
    set PM=pnpm.cmd
    echo [OK] Package manager: pnpm
) else (
    where npm.cmd >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No package manager found.
        goto :fail
    )
    echo [OK] Package manager: npm
)

REM ---- Check/create .env ----
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] .env not found, copying from .env.example...
        copy /y ".env.example" ".env" >nul
        echo [OK] .env created from .env.example
    ) else (
        echo [WARN] .env.example not found, using defaults.
    )
) else (
    echo [OK] .env exists
)

REM ---- Install dependencies ----
if not exist "node_modules\" (
    echo.
    echo [INFO] Installing dependencies...
    call %PM% install
    if errorlevel 1 goto :fail
    echo [OK] Dependencies installed
) else (
    echo [OK] node_modules exists
)

REM ---- Prisma generate ----
echo.
echo [INFO] Generating Prisma client...
call npx.cmd prisma generate --schema prisma/schema.prisma
if errorlevel 1 (
    echo [WARN] Prisma generate failed, continuing...
)

REM ---- Setup database ----
if not exist "prisma\dev.db" (
    echo.
    echo [INFO] Initializing database...
    call %PM% run prepare:db
    if errorlevel 1 goto :fail
    echo [OK] Database ready
) else (
    echo [OK] Database exists
)

REM ---- Start dev server ----
echo.
echo ============================================
echo   Starting services...
echo.
echo   Frontend : http://localhost:3100
echo   API      : http://localhost:3101/api
echo   Swagger  : http://localhost:3101/api-docs
echo.
echo   Press Ctrl+C to stop all services
echo ============================================
echo.

REM Open browser after services are up
start http://localhost:3100

call %PM% run dev
if errorlevel 1 goto :fail

echo.
echo [INFO] Services stopped.
goto :end

:fail
echo.
echo ============================================
echo   [ERROR] Start failed. See messages above.
echo ============================================
pause
exit /b 1

:end
echo.
echo Goodbye!
timeout /t 2 /nobreak >nul
endlocal
