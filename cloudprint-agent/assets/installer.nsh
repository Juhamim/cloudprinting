; Custom NSIS script for CloudPrint Agent installer
; Adds autostart registry key during installation

!macro customInstall
  ; Add to Windows startup (Run key)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CloudPrint Agent" "$INSTDIR\CloudPrint Agent.exe --hidden"
!macroend

!macro customUninstall
  ; Remove from Windows startup
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CloudPrint Agent"
!macroend
