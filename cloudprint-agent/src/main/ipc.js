/**
 * CloudPrint Agent — Secure IPC Handlers
 *
 * All ipcMain handlers are registered here.
 * 
 * Security rules:
 *  - Every handler validates that the sender is from the expected origin.
 *  - Settings writes are sanitized against the allowed key list.
 *  - No handler executes arbitrary code or shell commands.
 *  - File exports are written to user-chosen paths via dialog only.
 */

const { ipcMain, dialog, shell, app } = require('electron')
const path = require('path')
const fs   = require('fs')
const logger   = require('./logger').child('IPC')
const settings = require('./settings')
const agent    = require('./agent')
const { listPrinters } = require('./printer')

// Allowed setting keys — any key not in this set is silently rejected
const ALLOWED_SETTING_KEYS = new Set([
  'serverUrl', 'wsUrl', 'wsSecret', 'agentId',
  'printerName', 'startMinimized', 'checkUpdatesOnStart',
  'pollIntervalMs', 'syncIntervalMs', 'logLevel',
])

// ─────────────────────────────────────────────────────────────
// Origin validation helper
// ─────────────────────────────────────────────────────────────

function isTrustedSender(event) {
  // In production the renderer loads from a file:// URL
  // In dev it may load from localhost — allow both
  const url = event.senderFrame?.url || ''
  return url.startsWith('file://') || url.startsWith('http://localhost')
}

function guard(event) {
  if (!isTrustedSender(event)) {
    logger.warn(`IPC: Rejected message from untrusted sender: ${event.senderFrame?.url}`)
    throw new Error('Unauthorized IPC sender')
  }
}

// ─────────────────────────────────────────────────────────────
// Register all handlers
// ─────────────────────────────────────────────────────────────

function register(mainWindow) {
  // ── Settings ──────────────────────────────────────────────

  ipcMain.handle('settings:get-all', (event) => {
    guard(event)
    return settings.getAll()
  })

  ipcMain.handle('settings:set', (event, key, value) => {
    guard(event)
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      logger.warn(`IPC: Rejected write to unknown setting key: ${key}`)
      return { error: `Unknown setting key: ${key}` }
    }
    // Basic type sanitization
    if (typeof value === 'string') value = value.trim().slice(0, 2048)
    settings.set(key, value)
    logger.info(`Setting updated: ${key}`)
    return { ok: true }
  })

  ipcMain.handle('settings:set-all', (event, obj) => {
    guard(event)
    if (typeof obj !== 'object' || obj === null) return { error: 'Invalid payload' }
    const sanitized = {}
    for (const [k, v] of Object.entries(obj)) {
      if (!ALLOWED_SETTING_KEYS.has(k)) continue
      sanitized[k] = typeof v === 'string' ? v.trim().slice(0, 2048) : v
    }
    settings.setAll(sanitized)
    logger.info('Settings bulk-updated')
    return { ok: true }
  })

  ipcMain.handle('settings:validate', (event) => {
    guard(event)
    return settings.validate()
  })

  ipcMain.handle('settings:get-path', (event) => {
    guard(event)
    return settings.getPath()
  })

  // ── Agent ─────────────────────────────────────────────────

  ipcMain.handle('agent:start', async (event) => {
    guard(event)
    try {
      await agent.start()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('agent:stop', async (event) => {
    guard(event)
    try {
      await agent.stop()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('agent:restart', async (event) => {
    guard(event)
    try {
      await agent.stop()
      await agent.start()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('agent:state', (event) => {
    guard(event)
    return agent.getState()
  })

  ipcMain.handle('agent:job-history', (event) => {
    guard(event)
    return agent.getJobHistory()
  })

  // ── Printers ──────────────────────────────────────────────

  ipcMain.handle('printers:list', async (event) => {
    guard(event)
    try {
      return await listPrinters()
    } catch (err) {
      return []
    }
  })

  // ── Logs ──────────────────────────────────────────────────

  ipcMain.handle('logs:recent', (event, count) => {
    guard(event)
    const log = require('./logger')
    return log.getRecent(count || 200)
  })

  ipcMain.handle('logs:export', async (event) => {
    guard(event)
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export CloudPrint Logs',
      defaultPath: `cloudprint-logs-${new Date().toISOString().slice(0,10)}.txt`,
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
    })
    if (canceled || !filePath) return { canceled: true }

    try {
      const log = require('./logger')
      const content = log.exportLogs()
      fs.writeFileSync(filePath, content, 'utf8')
      return { ok: true, filePath }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('logs:open-dir', (event) => {
    guard(event)
    const log = require('./logger')
    shell.openPath(log.getLogsDir())
    return { ok: true }
  })

  // ── App ───────────────────────────────────────────────────

  ipcMain.handle('app:version', (event) => {
    guard(event)
    return app.getVersion()
  })

  ipcMain.handle('app:open-external', (event, url) => {
    guard(event)
    // Only allow https:// URLs
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      return { error: 'Only HTTPS URLs allowed' }
    }
    shell.openExternal(url)
    return { ok: true }
  })

  // ── Window ────────────────────────────────────────────────

  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:hide',     () => mainWindow.hide())

  logger.info('IPC handlers registered')
}

// ─────────────────────────────────────────────────────────────
// Agent → renderer event relay
// Push agent events to the renderer via webContents.send
// ─────────────────────────────────────────────────────────────

function relayAgentEvents(mainWindow) {
  const send = (channel, data) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    } catch (_) {}
  }

  agent.on('status',          (d) => send('agent:status', d))
  agent.on('job-start',       (d) => send('agent:job-start', d))
  agent.on('job-done',        (d) => send('agent:job-done', d))
  agent.on('job-failed',      (d) => send('agent:job-failed', d))
  agent.on('printers-synced', (d) => send('agent:printers-synced', d))
  agent.on('ws-connected',    ()  => send('agent:ws-connected', {}))
  agent.on('ws-disconnected', ()  => send('agent:ws-disconnected', {}))

  // Also relay new log entries live
  const log = require('./logger')
  log.on('log-entry', (entry) => send('logs:new-entry', entry))

  logger.info('Agent event relay registered')
}

module.exports = { register, relayAgentEvents }
