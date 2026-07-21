# Performance Test Script
Write-Host "=== Content Operations API Performance Test ===" -ForegroundColor Cyan
Write-Host ""

$apiUrl = "http://localhost:3100/api/content/packages/recommend?role=platform_operator"

# Function to measure response time
function Measure-ApiRequest {
    param($url)
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        $stopwatch.Stop()
        return $stopwatch.Elapsed.TotalMilliseconds
    } catch {
        $stopwatch.Stop()
        Write-Host "Error: $_" -ForegroundColor Red
        return -1
    }
}

# Test 1: First request (no cache)
Write-Host "Test 1: First request (no cache)" -ForegroundColor Yellow
$time1 = Measure-ApiRequest -url $apiUrl
Write-Host "Response time: $([math]::Round($time1, 2)) ms" -ForegroundColor Green
Write-Host ""

Start-Sleep -Milliseconds 500

# Test 2: Second request (with cache)
Write-Host "Test 2: Second request (with cache)" -ForegroundColor Yellow
$time2 = Measure-ApiRequest -url $apiUrl
Write-Host "Response time: $([math]::Round($time2, 2)) ms" -ForegroundColor Green
Write-Host ""

Start-Sleep -Milliseconds 500

# Test 3: Multiple cached requests
Write-Host "Test 3: 10 cached requests" -ForegroundColor Yellow
$times = @()
for ($i = 1; $i -le 10; $i++) {
    $time = Measure-ApiRequest -url $apiUrl
    if ($time -gt 0) {
        $times += $time
    }
    Start-Sleep -Milliseconds 100
}

$avgTime = ($times | Measure-Object -Average).Average
$maxTime = ($times | Measure-Object -Maximum).Maximum
$minTime = ($times | Measure-Object -Minimum).Minimum

Write-Host "Average response time: $([math]::Round($avgTime, 2)) ms" -ForegroundColor Green
Write-Host "Fastest response time: $([math]::Round($minTime, 2)) ms" -ForegroundColor Green
Write-Host "Slowest response time: $([math]::Round($maxTime, 2)) ms" -ForegroundColor Green
Write-Host ""

# Performance evaluation
Write-Host "=== Performance Evaluation ===" -ForegroundColor Cyan
if ($time2 -lt 50) {
    Write-Host "Cache Performance: Excellent (< 50ms)" -ForegroundColor Green
} elseif ($time2 -lt 100) {
    Write-Host "Cache Performance: Good (< 100ms)" -ForegroundColor Yellow
} else {
    Write-Host "Cache Performance: Needs Optimization (> 100ms)" -ForegroundColor Red
}

if ($avgTime -lt 50) {
    Write-Host "Average Performance: Excellent (< 50ms)" -ForegroundColor Green
} elseif ($avgTime -lt 100) {
    Write-Host "Average Performance: Good (< 100ms)" -ForegroundColor Yellow
} else {
    Write-Host "Average Performance: Needs Optimization (> 100ms)" -ForegroundColor Red
}
