@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================
echo  🚀 内容运营平台 - 后台快速启动 (Quick Start)
echo ===================================================
echo.

echo [1/2] 正在释放端口 3100 / 3101...
for %%p in (3100 3101) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        if not "%%a"=="0" taskkill /f /pid %%a >nul 2>&1
    )
)

echo [2/2] 正在后台启动全套服务...
echo.

set "VBS=%TEMP%\cop_start.vbs"
>"%VBS%" echo Set ws = CreateObject("WScript.Shell")
>>"%VBS%" echo ws.Run "cmd /c node scripts/dev-unified.js", 0, False
wscript "%VBS%" >nul 2>&1
del "%VBS%" >nul 2>&1

echo  ✅ 服务启动命令已成功发出，请等待约 10~15 秒就绪。
echo.
echo  🌐 前端应用 : http://localhost:3100
echo  ⚙️ 后端 API : http://localhost:3101/api
echo  📖 Swagger  : http://localhost:3101/api-docs
echo.
echo  💡 如需停止服务，请双击运行 stop-quick.bat
echo.
timeout /t 5 /nobreak >nul
