/**
 * CloudPrint Agent — Electron Main Process
 *
 * Security posture:
 *  - contextIsolation: true
 *  - nodeIntegration: false  (renderer gets NO node access)
 *  - sandbox: true (renderer)
 *  - webSecurity: true
 *  - CSP enforced via meta tag in renderer HTML
 *  - All renderer↔main communication via validated IPC only
 */

const { app, BrowserWindow, session } = require('electron')
const path = require('path')

// ─────────────────────────────────────────────────────────────
// Boot logger first (before anything else can fail)
// ─────────────────────────────────────────────────────────────
const logger = require('./logger')

logger.info('═══════════════════════════════════════')
logger.info('  CloudPrint Agent v' + app.getVersion())
logger.info('═══════════════════════════════════════')
logger.info(`Platform: ${process.platform} ${process.arch}`)
logger.info(`Node: ${process.version}`)
logger.info(`Electron: ${process.versions.electron}`)

// ─────────────────────────────────────────────────────────────
// Single-instance lock
// ─────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  logger.warn('Another instance is already running — exiting')
  app.quit()
  process.exit(0)
}

// ─────────────────────────────────────────────────────────────
// Load modules
// ─────────────────────────────────────────────────────────────
const settings = require('./settings')
const agent    = require('./agent')
const trayMod  = require('./tray')
const ipc      = require('./ipc')
const updater  = require('./updater')

let mainWindow = null
let tray = null

// ─────────────────────────────────────────────────────────────
// Window factory
// ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  900,
    height: 640,
    minWidth:  760,
    minHeight: 520,
    title: 'CloudPrint Agent',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    frame: true,
    show: false,          // NEVER shown on startup — tray-only by default
    skipTaskbar: true,    // no taskbar button (like old VBScript agent)
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  // ── CSP ───────────────────────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "font-src 'self' data:; " +
          "img-src 'self' data:; " +
          "connect-src 'none';"
        ],
      },
    })
  })

  // ── Load renderer (always, even hidden — so IPC works) ────
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))

  // ── Only show window if explicitly opened (--show flag or
  //    settings are missing, meaning first run) ─────────────
  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--show')) {
      _showWindow()
    }
    // Otherwise stay completely hidden — user opens via tray click
  })

  // ── Closing hides to tray, never quits ───────────────────
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
      logger.info('Window hidden to tray')
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // ── DevTools in dev mode ──────────────────────────────────
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  return mainWindow
}

// ─────────────────────────────────────────────────────────────
// Show window helper — restores taskbar button when opened
// ─────────────────────────────────────────────────────────────
function _showWindow() {
  if (!mainWindow) return
  mainWindow.setSkipTaskbar(false)
  mainWindow.show()
  mainWindow.focus()
}

// ─────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  logger.info('App ready')

  // Create window (stays hidden)
  mainWindow = createWindow()

  // System tray (created first — this is the primary UI)
  tray = trayMod.create(mainWindow, agent, _showWindow)

  // Register IPC handlers
  ipc.register(mainWindow)
  ipc.relayAgentEvents(mainWindow)

  // Configure auto-updater
  updater.configure(mainWindow, tray)

  // Start the print agent if configured, otherwise open setup
  const { valid, missing } = settings.validate()
  if (valid) {
    try {
      await agent.start()
      logger.info('Agent started automatically')

      // Show a tray balloon so user knows the app is running silently
      _showStartupBalloon()
    } catch (err) {
      logger.error('Agent auto-start failed:', err.message)
      _showWindow()  // open so user sees the error
    }
  } else {
    // First run — open the setup wizard
    logger.warn(`First run — missing settings: ${missing.join(', ')}`)
    _showWindow()
  }

  // Auto-update check (silent)
  updater.startupCheck()
})

// ─────────────────────────────────────────────────────────────
// Startup balloon notification
// ─────────────────────────────────────────────────────────────
function _showStartupBalloon() {
  try {
    // Use tray balloon (Windows-native, like the old VBScript agent)
    if (tray && !tray.isDestroyed()) {
      tray.displayBalloon({
        title: 'CloudPrint Agent',
        content: 'Running in the background. Click the tray icon to open the dashboard.',
        iconType: 'info',
        noSound: true,
      })
    }
  } catch (_) {}
}

// Second-instance: bring window to front
app.on('second-instance', () => {
  _showWindow()
})

app.on('window-all-closed', () => {
  // On Windows/Linux, keep running in tray
  // Quit only on macOS if tray isn't used
  if (process.platform === 'darwin') app.quit()
})

app.on('activate', () => {
  _showWindow()
})

app.on('before-quit', async () => {
  app.isQuitting = true
  logger.info('App quitting — stopping agent…')
  try {
    await agent.stop()
  } catch (_) {}
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message, err.stack)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', String(reason))
})
