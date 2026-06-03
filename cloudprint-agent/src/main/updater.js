/**
 * CloudPrint Agent — Auto-Updater
 * Uses electron-updater with GitHub Releases.
 *
 * Flow:
 *  1. Check on startup (if checkUpdatesOnStart setting is true)
 *  2. Download silently in the background
 *  3. Notify user via tray balloon + window notification
 *  4. Install on next restart (quitAndInstall)
 */

const { autoUpdater } = require('electron-updater')
const { app, ipcMain, Notification } = require('electron')
const logger = require('./logger').child('Updater')
const settings = require('./settings')

let _mainWindow = null
let _tray = null

// ─────────────────────────────────────────────────────────────
// Configure
// ─────────────────────────────────────────────────────────────

function configure(mainWindow, tray) {
  _mainWindow = mainWindow
  _tray = tray

  autoUpdater.logger = {
    info:  (m) => logger.info(m),
    warn:  (m) => logger.warn(m),
    error: (m) => logger.error(m),
    debug: (m) => logger.debug(m),
  }

  // Don't auto-install on quit — let the user decide
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoDownload = true

  // ── Events ──────────────────────────────────────────────
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates…')
    _sendToWindow('updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    logger.info(`Update available: ${info.version}`)
    _sendToWindow('updater:available', info)

    // Show native notification
    _notify(
      'CloudPrint Agent Update',
      `Version ${info.version} is downloading in the background.`
    )
  })

  autoUpdater.on('update-not-available', (info) => {
    logger.info(`Up to date (${info.version})`)
    _sendToWindow('updater:not-available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    logger.debug(`Download: ${Math.round(progress.percent)}%`)
    _sendToWindow('updater:progress', {
      percent:     Math.round(progress.percent),
      transferred: progress.transferred,
      total:       progress.total,
      bytesPerSec: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info(`Update downloaded: ${info.version} — ready to install`)
    _sendToWindow('updater:downloaded', info)

    // Persistent notification with action
    _notify(
      'CloudPrint Update Ready',
      `v${info.version} will be installed when you restart the app.`,
      true
    )
  })

  autoUpdater.on('error', (err) => {
    logger.error('Updater error:', err.message)
    _sendToWindow('updater:error', { message: err.message })
  })

  // IPC: renderer can trigger install-and-restart
  ipcMain.on('updater:install-now', () => {
    logger.info('User requested install-and-restart')
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.on('updater:check-now', () => {
    checkForUpdates()
  })
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Trigger an update check.
 */
function checkForUpdates() {
  if (!settings.get('checkUpdatesOnStart') && _silentCheckFired) return
  try {
    autoUpdater.checkForUpdates().catch((err) => logger.warn('Update check failed:', err.message))
  } catch (err) {
    logger.warn('Update check threw:', err.message)
  }
}

let _silentCheckFired = false

/**
 * Run the startup check (called once after app ready).
 */
function startupCheck() {
  if (!settings.get('checkUpdatesOnStart')) {
    logger.info('Update check skipped (disabled in settings)')
    return
  }
  // Small delay so the main window is shown first
  setTimeout(() => {
    _silentCheckFired = true
    checkForUpdates()
  }, 5000)
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function _sendToWindow(channel, data) {
  try {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(channel, data)
    }
  } catch (_) {}
}

function _notify(title, body, persistent = false) {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, silent: !persistent })
      n.show()
    }
  } catch (_) {}
}

module.exports = { configure, checkForUpdates, startupCheck }
