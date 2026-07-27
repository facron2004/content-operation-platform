@echo off
setlocal enabledelayedexpansion
title 内容运营平台 - Electron 桌面版启动

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ===================================================
echo   💻 内容运营平台 Electron 桌面版启动中...
echo ===================================================
echo.

REM ---- 检查 Node.js / npm ----
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ [错误] 未找到 Node.js，请先安装 Node.js 20+
    pause
    exit /b 1
)

REM ---- 检查 .env ----
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
    )
)

REM ---- 检查 Prisma client 及数据库 ----
if not exist "node_modules\.prisma\client\index.js" (
    echo ➜ 正在生成 Prisma Client...
    call npx prisma generate --schema prisma/schema.prisma >nul 2>&1
)

if not exist "prisma\dev.db" (
    echo ➜ 正在初始化数据库...
    call npm run prepare:db >nul 2>&1
)

REM ---- 释放端口 3100/3101 ----
for %%p in (3100 3101) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        if not "%%a"=="0" taskkill /f /pid %%a >nul 2>&1
    )
)

echo ➜ 正在拉起全套服务与 Electron 桌面客户端窗口...
echo.

call npm run electron:dev

endlocal
