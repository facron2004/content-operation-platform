@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ===================================================
echo  🛑 正在停止内容运营平台全套服务...
echo ===================================================
echo.

echo ➜ 正在释放端口 3100 及 3101...
for %%p in (3100 3101) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        if not "%%a"=="0" (
            echo    已终止 PID %%a 的服务进程
            taskkill /f /pid %%a >nul 2>&1
        )
    )
)

echo ➜ 正在清理相关 Node.js 开发进程...
powershell -NoProfile -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*dev*' -or $_.CommandLine -like '*vite*' -or $_.CommandLine -like '*tsx*' } | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>&1

echo.
echo ✅ 所有相关服务与进程已安全关闭。
echo.
timeout /t 2 /nobreak >nul
