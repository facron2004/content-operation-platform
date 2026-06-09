$ErrorActionPreference = "Continue"

$restartCount = 0

Write-Host "[keepalive-api] started, press Ctrl+C to stop." -ForegroundColor Green

while ($true) {
  $restartCount++
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[keepalive-api] [$now] starting api, round $restartCount" -ForegroundColor Cyan

  npm run dev -w "@content/api"
  $exitCode = $LASTEXITCODE

  $stopAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[keepalive-api] [$stopAt] api exited, code=$exitCode, restart in 2s" -ForegroundColor Yellow
  Start-Sleep -Seconds 2
}
