@ECHO OFF
REM 启动 WEB(Vite) 于 :3100，代理 /api 到 http://127.0.0.1:3101。脱离调用方独立运行。
SETLOCAL
SET NODE="C:\Users\Facron\.workbuddy\binaries\node\versions\22.22.2\node.exe"
SET NODE_ROOT=C:\Users\Facron\.workbuddy\binaries\node\versions\22.22.2
SET PROJ=E:\Program\Content Operation Platform
SET VITE="E:\Program\Content Operation Platform\node_modules\vite\bin\vite.js"
SET PATH=%NODE_ROOT%;%PATH%
CD /D %PROJ%\apps\web
SET VITE_DEV_SERVER_PORT=3100
SET VITE_API_PROXY_TARGET=http://127.0.0.1:3101
%NODE% %VITE% --host 127.0.0.1 --port 3100
ENDLOCAL
