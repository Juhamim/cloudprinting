@echo off
cd /d "%~dp0"
if exist agent.log (
    start notepad.exe agent.log
) else (
    echo No log file found yet. Has the agent run?
    pause
)
