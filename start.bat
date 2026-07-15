@echo off
setlocal enabledelayedexpansion

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
for /f "tokens=1,2,3 delims=." %%a in ('node -v') do (
    set NODE_MAJOR=%%a
)
set NODE_MAJOR=%NODE_MAJOR:~1%
if %NODE_MAJOR% LSS 20 (
    echo [ERROR] Node.js 20+ required. Current: %NODE_MAJOR%
    goto :fail
)
echo [OK] Node.js version:
node -v

REM ---- Detect package manager ----
set PM=npm.cmd
set INSTALL_CMD=install
where pnpm.cmd >nul 2>nul
if not errorlevel 1 (
    set PM=pnpm.cmd
    set INSTALL_CMD=install
    echo [OK] Package manager: pnpm
) else (
    where npm.cmd >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No package manager found (npm/pnpm).
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
        echo [WARN] Please review .env and configure as needed.
    ) else (
        echo [WARN] .env and .env.example not found - using defaults.
    )
) else (
    echo [OK] .env exists
)

REM ---- Install dependencies ----
if not exist "node_modules\" (
    echo.
    echo [INFO] node_modules not found, running %PM% %INSTALL_CMD%...
    call %PM% %INSTALL_CMD%
    if errorlevel 1 goto :fail
    echo [OK] Dependencies installed
) else (
    echo [OK] node_modules exists
)

REM ---- Prisma generate ----
echo.
echo [INFO] Generating Prisma client...
call npx prisma generate --schema prisma/schema.prisma
if errorlevel 1 (
    echo [WARN] Prisma generate failed, continuing anyway...
)

REM ---- Setup database ----
if not exist "prisma\dev.db" (
    echo.
    echo [INFO] Database not found, running prepare:db...
    call %PM% run prepare:db
    if errorlevel 1 goto :fail
    echo [OK] Database ready
) else (
    echo [OK] Database exists
)

REM ---- Start dev server ----
echo.
echo ============================================
echo   Starting development server...
echo   Frontend : http://localhost:3100
echo   API      : http://localhost:3101/api
echo   Swagger  : http://localhost:3101/api-docs
echo   Press Ctrl+C to stop
echo ============================================
echo.

REM Open browser after a short delay (in a separate process)
start /b "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3100"

call %PM% run dev
if errorlevel 1 goto :fail

echo.
echo [INFO] Server stopped.
goto :end

:fail
echo.
echo ============================================
echo   [ERROR] Quick start failed.
echo   See messages above for details.
echo ============================================
pause
exit /b 1

:end
echo.
echo Goodbye!
timeout /t 2 /nobreak >nul
endlocal
