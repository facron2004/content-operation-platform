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

REM ---- Check package manager ----
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found.
    goto :fail
)
set PM=npm.cmd
echo [OK] Package manager: npm

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
    echo [WARN] Prisma generate failed（可能是临时文件锁），2秒后重试...
    timeout /t 2 /nobreak >nul
    call npx.cmd prisma generate --schema prisma/schema.prisma
)
if errorlevel 1 (
    echo [WARN] Prisma generate 两次均失败，继续启动...
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
echo   会先等 API 健康检查通过，再启动前端并打开浏览器
echo   Press Ctrl+C to stop all services
echo ============================================
echo.

set NODE_ENV=development
set DEV_OPEN_BROWSER=1
set DEV_PUBLIC_PORT=3100
set DEV_API_PORT=3101
set PORT=3101
set HOST=127.0.0.1

call %PM% run dev
echo.
echo [INFO] Dev server stopped.
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
