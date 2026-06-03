/**
 * CloudPrint Agent — System Tray
 * Manages the tray icon, tooltip, context menu, and state-based icon switching.
 */

const { Tray, Menu, nativeImage, app } = require('electron')
const path = require('path')
const logger = require('./logger').child('Tray')

let _tray = null
let _mainWindow = null
let _showWindow = null
let _state = 'offline'  // 'online' | 'offline' | 'printing' | 'error'
let _jobCount = 0

// ─────────────────────────────────────────────────────────────
// Icon helpers
// ─────────────────────────────────────────────────────────────

const ICON_DIR = path.join(__dirname, '..', '..', 'assets')

function getIconPath(state) {
  const map = {
    online:   'tray-online.png',
    offline:  'tray-offline.png',
    printing: 'tray-printing.png',
    error:    'tray-offline.png',
  }
  return path.join(ICON_DIR, map[state] || 'tray-offline.png')
}

function loadIcon(state) {
  try {
    return nativeImage.createFromPath(getIconPath(state))
  } catch (_) {
    // Fallback to empty image if asset missing
    return nativeImage.createEmpty()
  }
}

// ─────────────────────────────────────────────────────────────
// Context menu builder
// ─────────────────────────────────────────────────────────────

function buildMenu(agent) {
  const stateLabel = {
    online:   '🟢 Agent Online',
    offline:  '🔴 Agent Offline',
    printing: '🔵 Printing…',
    error:    '🟡 Connection Error',
  }[_state] || '⚪ Unknown'

  return Menu.buildFromTemplate([
    {
      label: 'CloudPrint Agent',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: stateLabel,
      enabled: false,
    },
    {
      label: `Jobs completed: ${_jobCount}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => { if (_showWindow) _showWindow() },
    },
    { type: 'separator' },
    {
      label: _state === 'offline' || _state === 'error' ? 'Start Agent' : 'Restart Agent',
      click: async () => {
        try {
          await agent.stop()
          await agent.start()
          logger.info('Agent restarted from tray')
        } catch (err) {
          logger.error('Restart failed:', err.message)
        }
      },
    },
    {
      label: 'Stop Agent',
      click: async () => {
        try {
          await agent.stop()
          logger.info('Agent stopped from tray')
        } catch (err) {
          logger.error('Stop failed:', err.message)
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit CloudPrint Agent',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

function create(mainWindow, agent, showWindowFn) {
  _mainWindow = mainWindow
  _showWindow = showWindowFn || (() => { mainWindow.show(); mainWindow.focus() })

  _tray = new Tray(loadIcon('offline'))
  _tray.setToolTip('CloudPrint Agent — starting…')

  _tray.setContextMenu(buildMenu(agent))

  // Left-click: show the dashboard window
  _tray.on('click', () => {
    if (_mainWindow.isVisible()) {
      _mainWindow.hide()
      _mainWindow.setSkipTaskbar(true)
    } else {
      _showWindow()
    }
  })

  // Wire agent events → tray state changes
  agent.on('status', ({ state, error }) => {
    setState(state === 'running' || state === 'online' ? 'online'
           : state === 'error'                        ? 'error'
           : 'offline', agent)
    _tray.setToolTip(error ? `CloudPrint Agent — ${error}` : tooltip())
  })

  agent.on('job-start', () => {
    setState('printing', agent)
    _tray.setToolTip('CloudPrint Agent — Printing…')
  })

  agent.on('job-done', () => {
    _jobCount++
    setState('online', agent)
    _tray.setToolTip(tooltip())
  })

  agent.on('job-failed', () => {
    setState('online', agent) // back to online even if job failed
    _tray.setToolTip(tooltip())
  })

  logger.info('Tray created')
  return _tray
}

function setState(state, agent) {
  _state = state
  if (_tray) {
    _tray.setImage(loadIcon(state))
    _tray.setContextMenu(buildMenu(agent))
  }
}

function tooltip() {
  return `CloudPrint Agent — ${_state} | ${_jobCount} jobs completed`
}

function getTray() { return _tray }

module.exports = { create, setState, getTray }
