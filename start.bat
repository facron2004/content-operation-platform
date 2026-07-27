@echo off
setlocal enabledelayedexpansion
title 内容运营平台 - 快速启动服务

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ===================================================
echo   🚀 内容运营平台 (Content Ops Platform) 快速启动
echo ===================================================
echo.

REM ---- 1. 检查 Node.js / npm 环境 ----
echo [1/5] 检查运行环境...
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ [错误] 未找到 Node.js，请先安装 Node.js 20+ (https://nodejs.org/)
    goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
    echo ❌ [错误] 未找到 npm 命令。
    goto :fail
)
echo    ✓ Node.js / npm 环境正常

REM ---- 2. 检查 .env 配置文件 ----
echo [2/5] 检查配置文件...
if not exist ".env" (
    if exist ".env.example" (
        echo    ➜ 复制 .env.example 为 .env...
        copy /y ".env.example" ".env" >nul
        echo    ✓ 已成功创建 .env 配置文件
    ) else (
        echo    ⚠ [警告] 未找到 .env.example，将使用默认配置
    )
) else (
    echo    ✓ .env 配置文件已就绪
)

REM ---- 3. 检查依赖包 ----
echo [3/5] 检查依赖包...
if not exist "node_modules\" (
    echo    ➜ 未检测到 node_modules，正在自动安装依赖...
    call npm install
    if errorlevel 1 (
        echo ❌ [错误] 依赖包安装失败，请检查网络或配置
        goto :fail
    )
    echo    ✓ 依赖安装完成
) else (
    echo    ✓ 依赖包 node_modules 已就绪
)

REM ---- 4. 检查 Prisma Client 及数据库 ----
echo [4/5] 检查 Prisma Client 及数据库...
if not exist "node_modules\.prisma\client\index.js" (
    echo    ➜ 正在生成 Prisma Client...
    call npx prisma generate --schema prisma/schema.prisma
    if errorlevel 1 (
        echo ❌ [错误] Prisma Client 生成失败
        goto :fail
    )
    echo    ✓ Prisma Client 生成完成
) else (
    echo    ✓ Prisma Client 已就绪 (已自动跳过重复生成以提速)
)

if not exist "prisma\dev.db" (
    echo    ➜ 正在初始化数据库 dev.db...
    call npm run prepare:db
    if errorlevel 1 (
        echo ❌ [错误] 数据库初始化失败
        goto :fail
    )
    echo    ✓ 数据库初始化完成
) else (
    echo    ✓ 数据库 dev.db 已就绪
)

REM ---- 5. 释放被占用的端口并启动服务 ----
echo [5/5] 正在检查并释放端口占用 (3100/3101)...
for %%p in (3100 3101) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        if not "%%a"=="0" (
            echo    ➜ 正在清理端口 %%p 占用的进程 (PID: %%a)...
            taskkill /f /pid %%a >nul 2>&1
        )
    )
)

echo.
echo ===================================================
echo   🎉 正在启动全套服务引擎...
echo.
echo   🌐 前端应用 (Web)    : http://localhost:3100
echo   ⚙️ 后端 API (Express): http://localhost:3101/api
echo   📖 API 文档 (Swagger): http://localhost:3101/api-docs
echo.
echo   提示: 浏览器将在 API 就绪后自动打开
echo   按 Ctrl+C 可随时停止所有服务
echo ===================================================
echo.

set NODE_ENV=development
set DEV_OPEN_BROWSER=1
set DEV_PUBLIC_PORT=3100
set DEV_API_PORT=3101
set PORT=3101
set HOST=127.0.0.1

call npm run dev
goto :end

:fail
echo.
echo ===================================================
echo   ❌ [启动失败] 请检查上方提示信息
echo ===================================================
pause
exit /b 1

:end
echo.
echo 服务已停止。
timeout /t 2 /nobreak >nul
endlocal
