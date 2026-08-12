@ECHO OFF
REM 启动 Content Ops API 于 :3101（.env 期望端口）。脱离调用方独立运行。
SETLOCAL
SET NODE="C:\Users\Facron\.workbuddy\binaries\node\versions\22.22.2\node.exe"
SET NODE_ROOT=C:\Users\Facron\.workbuddy\binaries\node\versions\22.22.2
SET PROJ=E:\Program\Content Operation Platform
SET PATH=%NODE_ROOT%;%PATH%
CD /D %PROJ%\apps\api
SET NODE_ENV=development
SET APP_RUNTIME=development
SET PORT=3101
SET HOST=127.0.0.1
SET DATABASE_URL=file:E:/Program/Content Operation Platform/prisma/dev.db
%NODE% dist/main.js
ENDLOCAL
