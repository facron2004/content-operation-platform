#Requires -Version 5.1
<#
.SYNOPSIS
  Collect soldout package links from JeeSite after cold-starting npm run dev.

.DESCRIPTION
  Triggered by Windows Task Scheduler at 23:50 daily:
    1. If port 3101 already listening -> reuse; else background-launch npm run dev
    2. Poll GET /api/content/health up to 90s
    3. POST /api/content/soldout-links/collect (force refresh + write markdown)
    4. Push to Telegram via `hermes send --to telegram`
    5. All logs go to E:\Program\内容运营\logs\collect-soldout-YYYYMMDD.log

.PARAMETER SkipStart
  Skip cold-start step. Service must already be running.

.PARAMETER NoTelegram
  Skip Telegram push, only write markdown to disk.

.PARAMETER ApiPort
  Override API port. Default 3101 (matches EXTERNAL_API_BASE_URL dev scripts).
  NOTE: current .env sets PORT=3100, so default 3100 is what actually runs.

.PARAMETER CollectToken
  Token for x-internal-token header on POST /soldout-links/collect.
  Read from SOLDOUT_COLLECT_TOKEN env if not provided. If neither is set,
  the script aborts (the server rejects collect without a valid token).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File E:\Program\内容运营\scripts\collect-soldout.ps1
#>

[CmdletBinding()]
param(
    [switch]$SkipStart,
    [switch]$NoTelegram,
    [string]$ApiPort = '3100',
    [string]$CollectToken = $env:SOLDOUT_COLLECT_TOKEN
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$ProjectRoot = 'E:\Program\内容运营'
$ApiBase = "http://127.0.0.1:$ApiPort"
$LogDir = Join-Path $ProjectRoot 'logs'
$Today = Get-Date -Format 'yyyyMMdd'
$LogFile = Join-Path $LogDir ("collect-soldout-" + $Today + ".log")

function Ensure-Dir {
    param([string]$Path)
    if ([string]::IsNullOrEmpty($Path)) { return }
    if (-not (Test-Path -LiteralPath $Path)) {
        try {
            New-Item -ItemType Directory -Path $Path -Force -ErrorAction SilentlyContinue | Out-Null
        } catch {}
    }
}

function Ensure-File {
    param([string]$Path)
    if ([string]::IsNullOrEmpty($Path)) { return }
    $parent = Split-Path -Parent $Path
    Ensure-Dir $parent
    if (-not (Test-Path -LiteralPath $Path)) {
        try {
            New-Item -ItemType File -Path $Path -Force -ErrorAction SilentlyContinue | Out-Null
        } catch {}
    }
}

Ensure-Dir $LogDir
Ensure-File $LogFile
$ErrorActionPreference = 'Stop'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-ApiReady {
    param([int]$TimeoutSec = 90, [int]$PollIntervalSec = 3)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri "$ApiBase/api/content/health" -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                $body = $resp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($body.status -eq 'ok') { return $true }
            }
        } catch {
            # not ready yet
        }
        Start-Sleep -Seconds $PollIntervalSec
    }
    return $false
}

function Test-PortOpen {
    param([string]$Port)
    try {
        $conn = Test-NetConnection -ComputerName '127.0.0.1' -Port ([int]$Port) -WarningAction SilentlyContinue -InformationLevel Quiet
        return $conn
    } catch {
        return $false
    }
}

function Start-DevServer {
    Write-Log 'Cold start: launching npm run dev'
    $shellArgs = @(
        '-NoProfile'
        '-ExecutionPolicy'
        'Bypass'
        '-Command'
        "cd '$ProjectRoot'; npm run dev"
    )
    $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $shellArgs -WindowStyle Hidden -PassThru
    Write-Log "Started dev process, PID=$($proc.Id)"
    return $proc
}

try {
    Write-Log '=== collect-soldout start ==='

    $alreadyRunning = Test-PortOpen -Port $ApiPort
    if ($alreadyRunning -and -not $SkipStart) {
        Write-Log "Port $ApiPort already open, service is running, skip cold start"
    } elseif (-not $alreadyRunning -and -not $SkipStart) {
        Start-DevServer | Out-Null
        Write-Log 'Waiting for API health...'
        if (-not (Test-ApiReady -TimeoutSec 90)) {
            throw "API not ready within 90s, aborting"
        }
        Write-Log 'API ready'
    } else {
        if (-not (Test-PortOpen -Port $ApiPort)) {
            throw 'SkipStart requested but service is not running, refusing to continue'
        }
        Write-Log 'SkipStart mode, reusing existing service'
    }

    if ([string]::IsNullOrEmpty($CollectToken)) {
        throw "SOLDOUT_COLLECT_TOKEN is empty. Set it in env or pass -CollectToken. The server rejects collect without a valid token."
    }

    $collectUrl = "$ApiBase/api/content/soldout-links/collect?refresh=true"
    Write-Log "POST $collectUrl"
    $collectHeaders = @{ 'x-internal-token' = $CollectToken }
    $collectResp = Invoke-RestMethod -Uri $collectUrl -Method Post -Headers $collectHeaders -TimeoutSec 120
    if (-not $collectResp.success) {
        throw "Collect endpoint returned failure: $($collectResp | ConvertTo-Json -Depth 3 -Compress)"
    }

    $total = $collectResp.total
    $mdPath = $collectResp.markdownPath
    Write-Log "Collect done: total=$total, markdown=$mdPath"

    if (-not $NoTelegram) {
        $msgTitle = "[soldout] $(Get-Date -Format 'yyyy-MM-dd') - $total packages"
        $markdownBody = $collectResp.markdown
        $chunkSize = 3500
        if ($markdownBody.Length -le $chunkSize) {
            Write-Log 'Push to Telegram (single message)'
            $pushOutput = hermes send --to telegram --subject "$msgTitle" "$markdownBody" 2>&1
            Write-Log "hermes send output: $pushOutput"
        } else {
            Write-Log "Markdown too long ($($markdownBody.Length) chars), splitting"
            $chunks = [regex]::Split($markdownBody, '(?s)(.{1,' + $chunkSize + '}(?:\s|$))') | Where-Object { $_ }
            for ($i = 0; $i -lt $chunks.Count; $i++) {
                $partTitle = "$msgTitle [$($i+1)/$($chunks.Count)]"
                hermes send --to telegram --subject "$partTitle" "$($chunks[$i])" 2>&1 | Out-Null
            }
        }
    } else {
        Write-Log 'NoTelegram mode, skip push'
    }

    Write-Log '=== collect-soldout done ==='
    exit 0
} catch {
    $errMsg = $_.Exception.Message
    Write-Log "Script error: $errMsg" 'ERROR'
    Write-Log ($_.ScriptStackTrace) 'ERROR'
    if (-not $NoTelegram) {
        $errBody = "[FAIL] soldout collection failed: $errMsg. Log: $LogFile"
        hermes send --to telegram --subject 'soldout collection FAILED' "$errBody" 2>&1 | Out-Null
    }
    exit 1
}