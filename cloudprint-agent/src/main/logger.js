/**
 * CloudPrint Agent — Logger
 * Daily-rotating log files written to %APPDATA%\CloudPrint Agent\logs\
 * 
 * Features:
 *  - Separate error.log and combined.log
 *  - Daily rotation (keeps 14 days)
 *  - In-memory ring buffer for the UI live log view
 *  - IPC-safe: emits 'log-entry' events for the renderer
 */

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')
const { app } = require('electron')

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getLogsDir() {
  // Works both before and after app.ready
  const base = app ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'CloudPrint Agent')
  const dir = path.join(base, 'logs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function timestamp() {
  return new Date().toISOString() // full ISO
}

function levelLabel(level) {
  return level.toUpperCase().padEnd(5)
}

// ─────────────────────────────────────────────────────────────
// Ring buffer — last 1000 log lines kept in memory for UI
// ─────────────────────────────────────────────────────────────
const RING_SIZE = 1000
const ringBuffer = []

function ringPush(entry) {
  if (ringBuffer.length >= RING_SIZE) ringBuffer.shift()
  ringBuffer.push(entry)
}

// ─────────────────────────────────────────────────────────────
// File write helpers
// ─────────────────────────────────────────────────────────────
let _currentDay = null
let _combinedStream = null
let _errorStream = null

function getStreams() {
  const today = todayStamp()
  if (today !== _currentDay) {
    // Close old streams
    if (_combinedStream) { try { _combinedStream.end() } catch (_) {} }
    if (_errorStream)    { try { _errorStream.end() }    catch (_) {} }

    const dir = getLogsDir()
    _combinedStream = fs.createWriteStream(path.join(dir, `${today}.log`),    { flags: 'a', encoding: 'utf8' })
    _errorStream    = fs.createWriteStream(path.join(dir, `${today}-error.log`), { flags: 'a', encoding: 'utf8' })
    _currentDay = today

    // Prune logs older than 14 days
    try {
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f)
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full)
      }
    } catch (_) { /* ignore prune errors */ }
  }
  return { combined: _combinedStream, error: _errorStream }
}

function writeLine(line) {
  try {
    const { combined, error: errStream } = getStreams()
    combined.write(line + '\n')
    if (line.includes('[ERROR]') || line.includes('[WARN ]')) {
      errStream.write(line + '\n')
    }
  } catch (err) {
    // fallback: stderr only
    process.stderr.write(`[LOGGER-FAIL] ${err.message}\n`)
  }
}

// ─────────────────────────────────────────────────────────────
// Logger class
// ─────────────────────────────────────────────────────────────
class Logger extends EventEmitter {
  constructor(namespace = 'App') {
    super()
    this.namespace = namespace
  }

  _log(level, ...args) {
    const ts   = timestamp()
    const ns   = this.namespace.padEnd(12)
    const msg  = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a))).join(' ')
    const line = `[${ts}] [${levelLabel(level)}] [${ns}] ${msg}`

    // Console output (coloured for dev)
    const colors = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' }
    const reset = '\x1b[0m'
    const c = colors[level] || ''
    if (level === 'error') process.stderr.write(`${c}${line}${reset}\n`)
    else                   process.stdout.write(`${c}${line}${reset}\n`)

    // File
    writeLine(line)

    // Ring buffer + event for renderer
    const entry = { ts, level, ns: this.namespace, msg, line }
    ringPush(entry)
    this.emit('log-entry', entry)
    logger.emit('log-entry', entry) // also global logger
  }

  info  (...args) { this._log('info',  ...args) }
  warn  (...args) { this._log('warn',  ...args) }
  error (...args) { this._log('error', ...args) }
  debug (...args) { this._log('debug', ...args) }
}

// ─────────────────────────────────────────────────────────────
// Singleton global logger (namespace: App)
// ─────────────────────────────────────────────────────────────
const logger = new Logger('App')

/**
 * Create a namespaced child logger.
 * @param {string} namespace
 * @returns {Logger}
 */
logger.child = function (namespace) {
  return new Logger(namespace)
}

/**
 * Return recent ring-buffer entries for the UI.
 * @param {number} [count=200]
 * @returns {Array}
 */
logger.getRecent = function (count = 200) {
  return ringBuffer.slice(-count)
}

/**
 * Export all log files for today as a concatenated string.
 * @returns {string}
 */
logger.exportLogs = function () {
  try {
    const dir = getLogsDir()
    const today = todayStamp()
    const logFile = path.join(dir, `${today}.log`)
    if (fs.existsSync(logFile)) return fs.readFileSync(logFile, 'utf8')
    return '(No logs for today)'
  } catch (err) {
    return `(Failed to read logs: ${err.message})`
  }
}

/**
 * Return the logs directory path for the UI.
 */
logger.getLogsDir = getLogsDir

module.exports = logger
