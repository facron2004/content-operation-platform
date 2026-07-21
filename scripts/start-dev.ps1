# 开发服务器启动脚本
# 自动处理端口占用问题

Write-Host "正在检查端口占用..." -ForegroundColor Cyan

# 检查并关闭占用统一入口端口 3100 的进程
$port3100 = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
if ($port3100) {
    $pids = $port3100 | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }
    if ($pids) {
        Write-Host "发现端口 3100 被占用，进程 ID: $($pids -join ', ')" -ForegroundColor Yellow
        foreach ($processId in $pids) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Host "已关闭进程 $processId" -ForegroundColor Green
            } catch {
                Write-Host "无法关闭进程 $processId : $_" -ForegroundColor Red
            }
        }
        Start-Sleep -Seconds 1
    }
}

# 检查并关闭内部 API 端口和旧前端端口
$devPorts = @(3101) + (5174..5180)
foreach ($port in $devPorts) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }
        if ($pids) {
            Write-Host "发现端口 $port 被占用，进程 ID: $($pids -join ', ')" -ForegroundColor Yellow
            foreach ($processId in $pids) {
                try {
                    Stop-Process -Id $processId -Force -ErrorAction Stop
                    Write-Host "已关闭进程 $processId" -ForegroundColor Green
                } catch {
                    Write-Host "无法关闭进程 $processId : $_" -ForegroundColor Red
                }
            }
        }
    }
}

Write-Host "`n端口清理完成，正在启动统一入口开发服务器..." -ForegroundColor Cyan
Start-Sleep -Seconds 1

# 启动开发服务器（由 scripts/dev-unified.js 负责：只构建一次 shared、先等 API 就绪再起前端）
Set-Location $PSScriptRoot\..
$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "development" }
$env:DEV_OPEN_BROWSER = if ($env:DEV_OPEN_BROWSER) { $env:DEV_OPEN_BROWSER } else { "1" }
$env:DEV_PUBLIC_PORT = if ($env:DEV_PUBLIC_PORT) { $env:DEV_PUBLIC_PORT } else { "3100" }
$env:DEV_API_PORT = if ($env:DEV_API_PORT) { $env:DEV_API_PORT } else { "3101" }
$env:PORT = $env:DEV_API_PORT
$env:HOST = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
npm run dev
