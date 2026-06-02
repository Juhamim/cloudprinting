@echo off
cd /d "%~dp0"
echo Checking CloudPrint Agent status...
echo =======================================
powershell -Command "$p = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe' AND CommandLine LIKE '%agent.js%'\"; if ($p) { Write-Host '● CloudPrint Agent is RUNNING' -ForegroundColor Green; Write-Host ('Process ID : ' + $p.ProcessId); Write-Host ('Path       : ' + $p.ExecutablePath); Write-Host ('Command    : ' + $p.CommandLine) } else { Write-Host '○ CloudPrint Agent is NOT running' -ForegroundColor Red }"
echo =======================================
echo.
pause
