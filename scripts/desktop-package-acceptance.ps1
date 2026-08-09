param(
  [Parameter(Mandatory = $true)]
  [string]$Executable,

  [Parameter(Mandatory = $true)]
  [string]$LegacyDatabase,

  [Parameter(Mandatory = $true)]
  [string]$OutputRoot,

  [int]$SuccessTimeoutSeconds = 180,

  [int]$FailureTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'

function Resolve-File([string]$PathValue, [string]$Description) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    throw "$Description 不存在: $PathValue"
  }
  return (Resolve-Path -LiteralPath $PathValue).Path
}

$resolvedExecutable = Resolve-File $Executable '安装后的 EXE'
$resolvedLegacyDatabase = Resolve-File $LegacyDatabase '旧数据库'
$legacyDatabaseHash = (Get-FileHash -LiteralPath $resolvedLegacyDatabase -Algorithm SHA256).Hash
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if (Test-Path -LiteralPath $resolvedOutputRoot) {
  throw "验收输出目录已存在。为避免覆盖用户资产，请传入一个新的目录: $resolvedOutputRoot"
}
New-Item -ItemType Directory -Path $resolvedOutputRoot | Out-Null

function Get-ExactAppProcessIds {
  @(Get-CimInstance Win32_Process |
      Where-Object { $_.ExecutablePath -eq $resolvedExecutable } |
      Select-Object -ExpandProperty ProcessId)
}

if ((Get-ExactAppProcessIds).Count -gt 0) {
  throw "目标 EXE 已在运行。脚本不会停止用户已有进程: $resolvedExecutable"
}

function Stop-ExactApp {
  $ids = @(Get-ExactAppProcessIds)
  foreach ($id in $ids) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if ((Get-ExactAppProcessIds).Count -eq 0) { return }
    Start-Sleep -Milliseconds 250
  }
  $remaining = (Get-ExactAppProcessIds) -join ', '
  throw "无法停止本次验收启动的 EXE 进程: $remaining"
}

function New-ScenarioUserData([string]$Name) {
  $userData = Join-Path $resolvedOutputRoot $Name
  New-Item -ItemType Directory -Path (Join-Path $userData 'data') -Force | Out-Null
  return $userData
}

function Get-DatabasePath([string]$UserData) {
  Join-Path $UserData 'data\content-operations.db'
}

function Seed-CurrentDatabase([string]$UserData) {
  Copy-Item -LiteralPath $resolvedLegacyDatabase -Destination (Get-DatabasePath $UserData)
}

function Start-PackagedApp([string]$UserData, [string]$LegacyPath) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $resolvedExecutable
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  [void]$startInfo.ArgumentList.Add("--user-data-dir=$UserData")
  [void]$startInfo.Environment.Remove('CONTENT_OPS_LEGACY_DATABASE_PATH')
  if ($LegacyPath) {
    $startInfo.Environment['CONTENT_OPS_LEGACY_DATABASE_PATH'] = $LegacyPath
  }
  return [System.Diagnostics.Process]::Start($startInfo)
}

function Read-ScenarioLog([string]$UserData) {
  $logPath = Join-Path $UserData 'logs\electron.log'
  if (-not (Test-Path -LiteralPath $logPath -PathType Leaf)) { return '' }
  return Get-Content -LiteralPath $logPath -Raw
}

function Get-LoggedPort([string]$LogText) {
  $matches = [regex]::Matches($LogText, '端口:\s*(\d+)')
  if ($matches.Count -eq 0) { return $null }
  return [int]$matches[$matches.Count - 1].Groups[1].Value
}

function Wait-ScenarioReady([string]$UserData) {
  $deadline = (Get-Date).AddSeconds($SuccessTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $log = Read-ScenarioLog $UserData
    $port = Get-LoggedPort $log
    if ($port) {
      try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/ready" -UseBasicParsing -TimeoutSec 5
        $payload = $response.Content | ConvertFrom-Json
        if ($response.StatusCode -eq 200 -and $payload.status -eq 'ready' -and
            $payload.checks.database -eq 'ok' -and $payload.checks.migrations -eq 'ok' -and
            $payload.checks.web -eq 'ok') {
          return [pscustomobject]@{ status = 'ready'; port = $port; logPath = (Join-Path $UserData 'logs\electron.log') }
        }
      } catch {
        # The API can be listening before /ready finishes its checks.
      }
    }
    if ($log -match '应用启动失败') {
      throw "应用在等待就绪时失败"
    }
    Start-Sleep -Seconds 1
  }
  throw "在 $SuccessTimeoutSeconds 秒内未通过 /ready"
}

function Wait-ScenarioFailure([string]$UserData) {
  $deadline = (Get-Date).AddSeconds($FailureTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $log = Read-ScenarioLog $UserData
    if ($log -match '应用启动失败|数据库迁移被其他进程占用|旧数据库导入失败|数据库迁移失败|一致性检查失败') {
      return [pscustomobject]@{ status = 'blocked'; port = $null; logPath = (Join-Path $UserData 'logs\electron.log') }
    }
    Start-Sleep -Seconds 1
  }
  throw "在 $FailureTimeoutSeconds 秒内未观察到预期的启动阻断"
}

function Invoke-Scenario(
  [string]$Name,
  [bool]$ExpectedReady,
  [scriptblock]$Prepare,
  [scriptblock]$Validate
) {
  $userData = New-ScenarioUserData $Name
  $started = $false
  $resultStatus = 'failed'
  $port = $null
  $errorMessage = $null
  try {
    & $Prepare $userData
    $legacyPath = if ($Name -eq 'legacy-import') { $resolvedLegacyDatabase } else { $null }
    [void](Start-PackagedApp $userData $legacyPath)
    $started = $true
    $observation = if ($ExpectedReady) { Wait-ScenarioReady $userData } else { Wait-ScenarioFailure $userData }
    $resultStatus = $observation.status
    $port = $observation.port
    & $Validate $userData $resultStatus
  } catch {
    $errorMessage = $_.Exception.Message
  } finally {
    if ($started -or (Get-ExactAppProcessIds).Count -gt 0) {
      try { Stop-ExactApp } catch { if (-not $errorMessage) { $errorMessage = $_.Exception.Message } }
    }
  }
  [pscustomobject]@{
    scenario = $Name
    expected = if ($ExpectedReady) { 'ready' } else { 'blocked' }
    observed = $resultStatus
    port = $port
    userData = $userData
    error = $errorMessage
  }
}

$results = @()
$results += Invoke-Scenario 'normal' $true {
  param($userData)
  Seed-CurrentDatabase $userData
} {
  param($userData, $status)
  if ($status -ne 'ready') { throw '正常场景未就绪' }
}

$results += Invoke-Scenario 'legacy-import' $true {
  param($userData)
} {
  param($userData, $status)
  if ($status -ne 'ready') { throw '旧库导入场景未就绪' }
  if (@(Get-ChildItem -LiteralPath (Join-Path $userData 'backups') -Filter 'before-import-*.db' -File -ErrorAction SilentlyContinue).Count -eq 0) {
    throw '旧库导入未生成 before-import 备份'
  }
  if ((Get-FileHash -LiteralPath $resolvedLegacyDatabase -Algorithm SHA256).Hash -ne $legacyDatabaseHash) {
    throw '旧库哈希检查异常'
  }
}

$results += Invoke-Scenario 'already-migrated' $true {
  param($userData)
  Seed-CurrentDatabase $userData
} {
  param($userData, $status)
  if ($status -ne 'ready') { throw '已迁移场景未就绪' }
  if (@(Get-ChildItem -LiteralPath (Join-Path $userData 'backups') -Filter 'before-migration-*.db' -File -ErrorAction SilentlyContinue).Count -eq 0) {
    throw '已有库迁移未生成 before-migration 备份'
  }
}

$results += Invoke-Scenario 'interrupted-retry' $true {
  param($userData)
  $previous = "$(Get-DatabasePath $userData).$([guid]::NewGuid()).previous"
  Copy-Item -LiteralPath $resolvedLegacyDatabase -Destination $previous
} {
  param($userData, $status)
  if ($status -ne 'ready') { throw '中断恢复场景未就绪' }
  if ((Read-ScenarioLog $userData) -notmatch '检测到上次迁移中断') { throw '未记录中断迁移恢复' }
}

$results += Invoke-Scenario 'locked' $false {
  param($userData)
  $lockPath = Join-Path $userData 'data\migration.lock'
  Set-Content -LiteralPath $lockPath -Value (@{ pid = $PID; token = 'acceptance-live-owner'; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json) -NoNewline
} {
  param($userData, $status)
  if ($status -ne 'blocked') { throw '锁定场景未被阻断' }
  if (-not (Test-Path -LiteralPath (Join-Path $userData 'data\migration.lock') -PathType Leaf)) { throw '锁定场景修改了原锁文件' }
}

$results += Invoke-Scenario 'corrupt' $false {
  param($userData)
  Set-Content -LiteralPath (Get-DatabasePath $userData) -Value 'not a sqlite database' -NoNewline
} {
  param($userData, $status)
  if ($status -ne 'blocked') { throw '损坏数据库场景未被阻断' }
  if ((Get-Content -LiteralPath (Get-DatabasePath $userData) -Raw) -ne 'not a sqlite database') { throw '损坏数据库原文件未保持不变' }
}

$results | ConvertTo-Json -Depth 5
$failed = @($results | Where-Object { $_.error -or $_.observed -eq 'failed' -or $_.observed -ne $_.expected })
if ($failed.Count -gt 0) {
  throw "桌面安装包验收失败: $($failed.scenario -join ', ')"
}
