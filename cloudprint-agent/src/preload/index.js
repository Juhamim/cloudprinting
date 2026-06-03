/**
 * CloudPrint Agent — Preload Script
 *
 * Exposes a carefully controlled API surface to the renderer via contextBridge.
 * The renderer has NO access to Node.js or Electron internals.
 *
 * Every function exposed here maps directly to a validated ipcMain handler.
 */

const { contextBridge, ipcRenderer } = require('electron')

// ─────────────────────────────────────────────────────────────
// Allowed IPC channels (whitelist)
// ─────────────────────────────────────────────────────────────
const INVOKE_CHANNELS = new Set([
  'settings:get-all',
  'settings:set',
  'settings:set-all',
  'settings:validate',
  'settings:get-path',
  'agent:start',
  'agent:stop',
  'agent:restart',
  'agent:state',
  'agent:job-history',
  'printers:list',
  'logs:recent',
  'logs:export',
  'logs:open-dir',
  'app:version',
  'app:open-external',
  'updater:check-now',
  'updater:install-now',
])

const SEND_CHANNELS = new Set([
  'window:minimize',
  'window:hide',
  'updater:check-now',
  'updater:install-now',
])

const LISTEN_CHANNELS = new Set([
  'agent:status',
  'agent:job-start',
  'agent:job-done',
  'agent:job-failed',
  'agent:printers-synced',
  'agent:ws-connected',
  'agent:ws-disconnected',
  'logs:new-entry',
  'updater:checking',
  'updater:available',
  'updater:not-available',
  'updater:progress',
  'updater:downloaded',
  'updater:error',
])

// ─────────────────────────────────────────────────────────────
// Expose API to renderer under window.cloudprint
// ─────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('cloudprint', {
  // ── Invoke (request/response) ──────────────────────────────
  invoke(channel, ...args) {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  // ── Send (fire and forget) ─────────────────────────────────
  send(channel, ...args) {
    if (!SEND_CHANNELS.has(channel)) return
    ipcRenderer.send(channel, ...args)
  },

  // ── On (event listener) ───────────────────────────────────
  on(channel, callback) {
    if (!LISTEN_CHANNELS.has(channel)) return () => {}
    const wrapped = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, wrapped)
    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, wrapped)
  },

  // ── Once ──────────────────────────────────────────────────
  once(channel, callback) {
    if (!LISTEN_CHANNELS.has(channel)) return
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  },
})
