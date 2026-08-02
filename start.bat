@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 内容运营平台 - 快速启动
cd /d "%~dp0"

REM 确保 Node.js 在 PATH 中
set "PATH=%LOCALAPPDATA%\pi-node\current;C:\nvm4w\nodejs;%PATH%"

echo.
echo ===================================================
echo   内容运营平台 - 快速启动
echo ===================================================
echo.

REM ---- 1. 环境检查 ----
echo [1/5] 检查运行环境...
where node >nul 2>nul
if errorlevel 1 (
    echo [X] 未找到 Node.js，请先安装 Node.js 20+
    goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
    echo [X] 未找到 npm
    goto :fail
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo     OK  Node.js %NODE_VER%

REM ---- 2. 配置文件 ----
echo [2/5] 检查配置文件...
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo     OK  已从 .env.example 创建 .env
    ) else (
        echo     OK  使用默认配置
    )
) else (
    echo     OK  .env 已就绪
)

REM ---- 3. 依赖包 ----
echo [3/5] 检查依赖包...
if not exist "node_modules\" (
    echo     安装依赖中...
    call npm install
    if errorlevel 1 (
        echo [X] 依赖安装失败
        goto :fail
    )
    echo     OK  依赖安装完成
) else (
    echo     OK  node_modules 已就绪
)

REM ---- 4. Prisma / 数据库 ----
echo [4/5] 检查数据库...
if not exist "node_modules\.prisma\client\index.js" (
    echo     生成 Prisma Client...
    call npx prisma generate --schema prisma/schema.prisma
    if errorlevel 1 (
        echo [X] Prisma Client 生成失败
        goto :fail
    )
    echo     OK  Prisma Client 已生成
) else (
    echo     OK  Prisma Client 已就绪
)
if not exist "prisma\dev.db" (
    echo     初始化数据库...
    call npm run prepare:db
    if errorlevel 1 (
        echo [X] 数据库初始化失败
        goto :fail
    )
    echo     OK  数据库已初始化
) else (
    echo     OK  数据库已就绪
)

REM ---- 5. 释放端口 ----
echo [5/5] 释放端口 3100/3101...
for %%p in (3100 3101) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r ":%%p " ^| findstr "LISTENING"') do (
        if not "%%a"=="0" (
            echo     清理端口 %%p - PID %%a
            taskkill /f /t /pid %%a >nul 2>&1
        )
    )
)
REM 验证端口释放
set /a RETRY=0
:port_check
set BUSY=0
for %%p in (3100 3101) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r ":%%p " ^| findstr "LISTENING"') do (
        if not "%%a"=="0" set BUSY=1
    )
)
if %BUSY%==1 (
    set /a RETRY+=1
    if %RETRY% GEQ 8 (
        echo [X] 端口无法释放，请手动关闭占用程序
        goto :fail
    )
    timeout /t 1 /nobreak >nul
    goto :port_check
)
echo     OK  端口已释放

REM ---- 启动 ----
echo.
echo 正在启动服务...

set NODE_ENV=development
set DEV_OPEN_BROWSER=1
set DEV_PUBLIC_PORT=3100
set DEV_API_PORT=3101
set PORT=3101
set HOST=127.0.0.1

start "Content Ops - Dev Server" /min cmd /c "cd /d "%~dp0" && set NODE_ENV=development&& set DEV_OPEN_BROWSER=1&& set DEV_PUBLIC_PORT=3100&& set DEV_API_PORT=3101&& set PORT=3101&& set HOST=127.0.0.1&& npm run dev"

REM 等待 API 就绪（最多 60 秒）
set /a WAIT=0
:wait_api
netstat -ano | findstr ":3101 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto :ready
set /a WAIT+=1
if %WAIT% GEQ 60 (
    echo [X] 服务启动超时（60s），请检查最小化窗口中的报错
    goto :fail
)
timeout /t 1 /nobreak >nul
goto :wait_api

:ready
echo.
echo ===================================================
echo   服务已启动!
echo   前端:  http://localhost:3100
echo   API:   http://localhost:3101/api
echo   文档:  http://localhost:3101/api-docs
echo ===================================================
echo.
timeout /t 3 /nobreak >nul
endlocal
exit /b 0

:fail
echo.
echo ===================================================
echo   启动失败，请检查上方提示
echo ===================================================
pause
exit /b 1
