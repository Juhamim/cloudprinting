const fs = require('fs')
const path = require('path')

console.log('╔═══════════════════════════════╗')
console.log('║  CloudPrint Startup Installer ║')
console.log('╚═══════════════════════════════╝')

if (process.platform !== 'win32') {
  console.error('[Error] This installer is designed for Windows systems only.');
  process.exit(1);
}

const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
const launcherName = 'cloudprint-agent-launcher.vbs'
const launcherPath = path.join(startupDir, launcherName)

const agentDir = __dirname
const agentScript = path.join(agentDir, 'agent.js')

console.log(`Startup Directory : ${startupDir}`)
console.log(`Agent Directory   : ${agentDir}`)
console.log(`Agent Script      : ${agentScript}`)
console.log('')

// VBScript template to run Node invisibly with redirected output handles to prevent crashes
const vbsContent = `Dim WshShell
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${agentDir}"
WshShell.Run "cmd /c ""${process.execPath}"" agent.js > nul 2>&1", 0, false
Set WshShell = Nothing
`

try {
  // Ensure the directory exists
  if (!fs.existsSync(startupDir)) {
    fs.mkdirSync(startupDir, { recursive: true })
  }

  // Write VBScript launcher to Startup folder
  fs.writeFileSync(launcherPath, vbsContent, 'utf8')
  console.log(`✓ Created launcher script at: ${launcherPath}`)
  
  // Try to start the agent immediately using the newly created launcher
  const { exec } = require('child_process')
  console.log('→ Launching agent in the background…')
  
  exec(`wscript.exe "${launcherPath}"`, (error) => {
    if (error) {
      console.warn('⚠️  Agent launcher ran, but returned status:', error.message)
    } else {
      console.log('✓ CloudPrint agent has been successfully installed and launched in the background!')
      console.log('  It will now run silently every time the system starts up or you log in.')
      console.log('  Use "status.bat" to check running state, or "view-logs.bat" to monitor logs.')
    }
  })
} catch (err) {
  console.error('[Error] Failed to install startup script:', err.message)
  process.exit(1)
}
