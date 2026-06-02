const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

console.log('╔═══════════════════════════════╗')
console.log('║  CloudPrint Startup Remover   ║')
console.log('╚═══════════════════════════════╝')

if (process.platform !== 'win32') {
  console.error('[Error] This script is designed for Windows systems only.');
  process.exit(1);
}

const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
const launcherName = 'cloudprint-agent-launcher.vbs'
const launcherPath = path.join(startupDir, launcherName)

try {
  let found = false
  if (fs.existsSync(launcherPath)) {
    fs.unlinkSync(launcherPath)
    console.log(`✓ Removed launcher from: ${launcherPath}`)
    found = true
  } else {
    console.log('ℹ No launcher script found in the Startup folder.')
  }

  // Stop any running background instances of the agent
  console.log('→ Stopping any running instances of agent.js…')
  
  // Use PowerShell to find and stop the specific node process running agent.js
  const psCmd = `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe' AND CommandLine LIKE '%agent.js%'\\" | ForEach-Object { Stop-Process $_.ProcessId -Force; Write-Output 'Stopped process' }"`
  
  exec(psCmd, (err, stdout, stderr) => {
    if (stdout.includes('Stopped process')) {
      console.log('✓ Successfully stopped running agent background process.')
    } else {
      console.log('✓ No active background agent process was running.')
    }
    console.log('\n✓ CloudPrint agent has been cleanly uninstalled!')
  })

} catch (err) {
  console.error('[Error] Failed to uninstall startup script:', err.message)
  process.exit(1)
}
