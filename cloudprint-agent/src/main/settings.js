/**
 * CloudPrint Agent — Settings
 * Persistent, encrypted local settings using electron-store.
 * 
 * All secrets (server URL, WS_SECRET, agentId) are stored with
 * encryptionKey derived from the machine's CPU ID + app name,
 * preventing simple file-system theft.
 */

const Store = require('electron-store')
const { app } = require('electron')
const crypto = require('crypto')
const os = require('os')

// ─────────────────────────────────────────────────────────────
// Derive a machine-unique encryption key
// ─────────────────────────────────────────────────────────────
function deriveMachineKey() {
  const raw = `${os.hostname()}-${os.cpus()?.[0]?.model || 'cpu'}-CloudPrintAgent`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

// ─────────────────────────────────────────────────────────────
// Schema with defaults
// ─────────────────────────────────────────────────────────────
const schema = {
  serverUrl: {
    type: 'string',
    default: 'http://localhost:3000',
  },
  wsUrl: {
    type: 'string',
    default: 'ws://localhost:3000/ws',
  },
  wsSecret: {
    type: 'string',
    default: '',
  },
  agentId: {
    type: 'string',
    default: '',
  },
  printerName: {
    type: 'string',
    default: '',  // empty = use system default
  },
  startMinimized: {
    type: 'boolean',
    default: true,
  },
  checkUpdatesOnStart: {
    type: 'boolean',
    default: true,
  },
  pollIntervalMs: {
    type: 'number',
    default: 1500,
    minimum: 500,
    maximum: 30000,
  },
  syncIntervalMs: {
    type: 'number',
    default: 10000,
    minimum: 5000,
    maximum: 60000,
  },
  logLevel: {
    type: 'string',
    enum: ['debug', 'info', 'warn', 'error'],
    default: 'info',
  },
}

let _store = null

function getStore() {
  if (!_store) {
    _store = new Store({
      name: 'cloudprint-settings',
      schema,
      encryptionKey: deriveMachineKey(),
      clearInvalidConfig: true,
    })
  }
  return _store
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
const settings = {
  get(key) {
    return getStore().get(key)
  },

  set(key, value) {
    getStore().set(key, value)
  },

  setAll(obj) {
    const store = getStore()
    for (const [k, v] of Object.entries(obj)) {
      store.set(k, v)
    }
  },

  getAll() {
    return getStore().store
  },

  reset() {
    getStore().clear()
  },

  /**
   * Validate that required fields are filled before the agent starts.
   * @returns {{ valid: boolean, missing: string[] }}
   */
  validate() {
    const store = getStore()
    const missing = []
    if (!store.get('serverUrl')) missing.push('serverUrl')
    if (!store.get('wsSecret'))  missing.push('wsSecret')
    if (!store.get('agentId'))   missing.push('agentId')
    return { valid: missing.length === 0, missing }
  },

  /**
   * Return the path to the settings file (for diagnostics).
   */
  getPath() {
    return getStore().path
  },
}

module.exports = settings
