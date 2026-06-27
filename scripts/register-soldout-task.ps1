#Requires -Version 5.1
<#
.SYNOPSIS
  在 Windows 任务计划程序里注册「每日 23:50 触发 collect-soldout.ps1」的定时任务。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File E:\Program\内容运营\scripts\register-soldout-task.ps1
#>

$ErrorActionPreference = 'Stop'
$TaskName = 'ContentOps-CollectSoldoutLinks'
$ScriptPath = 'E:\Program\内容运营\scripts\collect-soldout.ps1'
$PowershellExe = (Get-Command powershell.exe).Source

# 23:50 触发
$Trigger = New-ScheduledTaskTrigger -Daily -At '23:50'

# 用 SYSTEM 账户跑(电脑开着就会执行,不依赖登录用户)
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

# 设置:
#  - 工作目录 = 项目根,这样 npm 命令才能找到 package.json
#  - 即使 60s 没结束也允许继续(脚本可能耗时要冷启动 dev server)
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$Action = New-ScheduledTaskAction `
    -Execute $PowershellExe `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`"" `
    -WorkingDirectory 'E:\Program\内容运营'

# 先删除旧的(若有),避免重复注册
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "已删除旧任务: $TaskName"
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Trigger $Trigger `
    -Action $Action `
    -Principal $Principal `
    -Settings $Settings `
    -Description '每日 23:50 冷启动 E:\Program\内容运营 的 npm run dev,收集 JeeSite 售罄套餐链接,落盘 markdown 并推送 Telegram' `
    -Force | Out-Null

Write-Host "✅ 已注册定时任务: $TaskName"
Write-Host "   触发时间: 每天 23:50"
Write-Host "   脚本: $ScriptPath"
Write-Host "   验证: Get-ScheduledTask -TaskName $TaskName"
Write-Host "   手动触发(测试): Start-ScheduledTask -TaskName $TaskName"
Write-Host "   立即干跑(不注册): powershell -NoProfile -ExecutionPolicy Bypass -File '$ScriptPath'"