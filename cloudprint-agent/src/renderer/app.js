/**
 * CloudPrint Agent — Renderer / Frontend
 *
 * Communicates with the main process exclusively via window.cloudprint (contextBridge).
 * No Node.js or Electron APIs are accessible here.
 */

'use strict'

const cp = window.cloudprint   // preload bridge

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let jobHistory = []
let completedCount = 0
let failedCount = 0
let printerCount = 0
let logAutoScroll = true

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function q(sel) { return document.querySelector(sel) }

function formatBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function setStatus(state, sub) {
  const dot  = q('#status-dot')
  const icon = q('#status-icon')
  const lbl  = q('#status-label')
  const subEl = q('#status-sub')

  const CONFIG = {
    online:   { cls: 'online',   emoji: '🟢', label: 'Online',   bg: 'var(--green-dim)' },
    printing: { cls: 'printing', emoji: '🔵', label: 'Printing', bg: 'var(--blue-dim)' },
    offline:  { cls: 'offline',  emoji: '🔴', label: 'Offline',  bg: 'transparent' },
    error:    { cls: 'error',    emoji: '🟡', label: 'Error',    bg: 'var(--yellow-dim)' },
  }
  const cfg = CONFIG[state] || CONFIG.offline
  dot.className = `status-dot ${cfg.cls}`
  icon.textContent = cfg.emoji
  lbl.textContent  = cfg.label
  subEl.textContent = sub || ''
}

// ─────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.querySelector(`.panel[data-panel="${panel}"]`).classList.add('active')

    // Lazy-load printers when switching to that tab
    if (panel === 'printers') loadPrinters()
  })
})

// ─────────────────────────────────────────────────────────────
// Title-bar buttons
// ─────────────────────────────────────────────────────────────
q('#btn-minimize').addEventListener('click', () => cp.send('window:minimize'))

// ─────────────────────────────────────────────────────────────
// Agent controls
// ─────────────────────────────────────────────────────────────
q('#btn-start').addEventListener('click', async () => {
  setStatus('offline', 'Starting…')
  const r = await cp.invoke('agent:start')
  if (r.error) setStatus('error', r.error)
})

q('#btn-stop').addEventListener('click', async () => {
  await cp.invoke('agent:stop')
  setStatus('offline', 'Agent stopped')
})

q('#btn-restart').addEventListener('click', async () => {
  setStatus('offline', 'Restarting…')
  const r = await cp.invoke('agent:restart')
  if (r.error) setStatus('error', r.error)
})

// ─────────────────────────────────────────────────────────────
// Agent events → UI updates
// ─────────────────────────────────────────────────────────────
cp.on('agent:status', ({ state, error }) => {
  if (state === 'running' || state === 'online') setStatus('online', 'Connected to server')
  else if (state === 'error') setStatus('error', error || 'Connection failed')
  else setStatus('offline', 'Agent stopped')
})

cp.on('agent:job-start', (job) => {
  setStatus('printing', `Printing: ${job.title}`)
})

cp.on('agent:job-done', (job) => {
  completedCount++
  q('#stat-completed').textContent = completedCount
  setStatus('online', 'Ready')
  prependJobItem(job)
})

cp.on('agent:job-failed', (job) => {
  failedCount++
  q('#stat-failed').textContent = failedCount
  setStatus('online', 'Last job failed — see logs')
  prependJobItem(job)
})

cp.on('agent:printers-synced', (printers) => {
  printerCount = printers.length
  q('#stat-printers').textContent = printerCount
})

cp.on('agent:ws-connected',    () => {
  const badge = q('#ws-badge')
  badge.textContent = 'WS Connected'
  badge.className = 'badge badge-green'
})
cp.on('agent:ws-disconnected', () => {
  const badge = q('#ws-badge')
  badge.textContent = 'WS Disconnected'
  badge.className = 'badge badge-zinc'
})

// ─────────────────────────────────────────────────────────────
// Jobs panel
// ─────────────────────────────────────────────────────────────
const FILE_ICONS = {
  'application/pdf':   '📄',
  'application/msword':'📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'image/jpeg': '🖼️',
  'image/png':  '🖼️',
  'image/webp': '🖼️',
  'text/plain': '📃',
}

function prependJobItem(job) {
  // Remove empty state
  const empty = q('#jobs-list .empty-state')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'job-item'
  const icon = FILE_ICONS[job.fileType] || '📄'
  const statusBadge = job.status === 'COMPLETED'
    ? '<span class="badge badge-green">✓ Completed</span>'
    : job.status === 'PRINTING'
    ? '<span class="badge badge-blue">Printing</span>'
    : '<span class="badge badge-red">✗ Failed</span>'

  el.innerHTML = `
    <div class="job-icon">${icon}</div>
    <div class="job-info">
      <div class="job-title">${escapeHtml(job.title)}</div>
      <div class="job-meta">${escapeHtml(job.printer?.name || job.printerId || '')} · ${job.copies || 1} cop${job.copies === 1 ? 'y' : 'ies'} · ${timeAgo(job.createdAt || new Date().toISOString())}</div>
      ${job.errorMsg ? `<div class="badge badge-red" style="margin-top:4px; font-size:11px;">${escapeHtml(job.errorMsg)}</div>` : ''}
    </div>
    ${statusBadge}
  `
  const list = q('#jobs-list')
  list.insertBefore(el, list.firstChild)
}

q('#btn-clear-history').addEventListener('click', () => {
  q('#jobs-list').innerHTML = `
    <div class="empty-state">
      <div class="emoji">📭</div>
      <h3>No jobs yet</h3>
      <p>Print jobs will appear here as they are processed.</p>
    </div>`
  completedCount = 0
  failedCount    = 0
  q('#stat-completed').textContent = '0'
  q('#stat-failed').textContent    = '0'
})

// ─────────────────────────────────────────────────────────────
// Printers panel
// ─────────────────────────────────────────────────────────────
async function loadPrinters() {
  const list = q('#printers-list')
  list.innerHTML = '<div class="empty-state"><div class="emoji" style="font-size:24px">⏳</div><h3>Scanning…</h3></div>'

  const printers = await cp.invoke('printers:list')
  q('#stat-printers').textContent = printers.length
  printerCount = printers.length

  if (!printers.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="emoji">🔌</div>
      <h3>No printers found</h3>
      <p>Connect a USB printer and click Refresh.</p>
    </div>`
    return
  }

  list.innerHTML = ''
  for (const p of printers) {
    const el = document.createElement('div')
    el.className = 'printer-item'
    el.innerHTML = `
      <div class="printer-icon">🖨️</div>
      <div class="printer-info">
        <div class="printer-name">${escapeHtml(p.name)}</div>
        <div class="printer-meta">${p.isDefault ? '⭐ Default · ' : ''}${p.paperSizes?.join(', ') || 'Unknown sizes'}</div>
      </div>
      ${p.isDefault ? '<span class="badge badge-blue">Default</span>' : '<span class="badge badge-zinc">Available</span>'}
    `
    list.appendChild(el)
  }

  // Also populate the settings printer dropdown
  await populatePrinterDropdown(printers)
}

async function populatePrinterDropdown(printers) {
  const sel = q('#cfg-printer-name')
  const current = sel.value
  // Remove all non-default options
  while (sel.options.length > 1) sel.remove(1)
  for (const p of printers) {
    const opt = new Option(p.name + (p.isDefault ? ' (default)' : ''), p.name)
    sel.add(opt)
  }
  sel.value = current
}

q('#btn-refresh-printers').addEventListener('click', loadPrinters)

// ─────────────────────────────────────────────────────────────
// Logs panel
// ─────────────────────────────────────────────────────────────
function appendLogEntry(entry) {
  const viewer = q('#log-viewer')
  const el = document.createElement('div')
  el.className = `log-entry ${entry.level}`
  el.textContent = entry.line
  viewer.appendChild(el)

  // Auto-scroll unless user scrolled up
  if (logAutoScroll) viewer.scrollTop = viewer.scrollHeight

  // Cap DOM entries at 1000
  while (viewer.children.length > 1000) viewer.removeChild(viewer.firstChild)
}

// Detect user scroll to pause auto-scroll
q('#log-viewer').addEventListener('scroll', function () {
  const el = this
  logAutoScroll = (el.scrollHeight - el.scrollTop - el.clientHeight) < 30
})

// Live log relay
cp.on('logs:new-entry', (entry) => appendLogEntry(entry))

q('#btn-export-logs').addEventListener('click', async () => {
  const r = await cp.invoke('logs:export')
  if (r.ok) showToast(`Logs saved to ${r.filePath}`)
})

q('#btn-open-logs-dir').addEventListener('click', () => cp.invoke('logs:open-dir'))

q('#btn-clear-logs').addEventListener('click', () => {
  q('#log-viewer').innerHTML = ''
  logAutoScroll = true
})

// ─────────────────────────────────────────────────────────────
// Settings panel
// ─────────────────────────────────────────────────────────────
async function loadSettings() {
  const cfg = await cp.invoke('settings:get-all')
  q('#cfg-server-url').value     = cfg.serverUrl     || ''
  q('#cfg-ws-url').value         = cfg.wsUrl         || ''
  q('#cfg-ws-secret').value      = cfg.wsSecret      || ''
  q('#cfg-agent-id').value       = cfg.agentId       || ''
  q('#cfg-printer-name').value   = cfg.printerName   || ''
  q('#cfg-start-minimized').checked   = !!cfg.startMinimized
  q('#cfg-check-updates').checked     = !!cfg.checkUpdatesOnStart
  q('#cfg-poll-interval').value  = cfg.pollIntervalMs  || 1500
  q('#cfg-sync-interval').value  = cfg.syncIntervalMs  || 10000

  // Info on status tab
  q('#info-server').textContent  = cfg.serverUrl || '—'
  q('#info-agent-id').textContent = cfg.agentId  || '—'
  q('#info-poll').textContent    = `${cfg.pollIntervalMs || 1500} ms`

  // Footer
  const settingsPath = await cp.invoke('settings:get-path')
  q('#settings-path').textContent = settingsPath || ''
}

q('#btn-save-settings').addEventListener('click', async () => {
  const payload = {
    serverUrl:           q('#cfg-server-url').value.trim(),
    wsUrl:               q('#cfg-ws-url').value.trim(),
    wsSecret:            q('#cfg-ws-secret').value.trim(),
    agentId:             q('#cfg-agent-id').value.trim(),
    printerName:         q('#cfg-printer-name').value,
    startMinimized:      q('#cfg-start-minimized').checked,
    checkUpdatesOnStart: q('#cfg-check-updates').checked,
    pollIntervalMs:      parseInt(q('#cfg-poll-interval').value) || 1500,
    syncIntervalMs:      parseInt(q('#cfg-sync-interval').value) || 10000,
  }
  const r = await cp.invoke('settings:set-all', payload)
  if (r.error) {
    showSettingsStatus('red', `Error: ${r.error}`)
  } else {
    showSettingsStatus('green', '✓ Settings saved — restart agent to apply')
    await loadSettings()
  }
})

function showSettingsStatus(color, msg) {
  const el = q('#settings-status')
  el.textContent = msg
  el.className = `badge badge-${color}`
  el.style.display = 'flex'
  setTimeout(() => { el.style.display = 'none' }, 4000)
}

q('#btn-check-update').addEventListener('click', () => {
  cp.send('updater:check-now')
  showSettingsStatus('blue', 'Checking for updates…')
})

// ─────────────────────────────────────────────────────────────
// Setup wizard
// ─────────────────────────────────────────────────────────────
async function checkSetupNeeded() {
  const { valid } = await cp.invoke('settings:validate')
  if (!valid) {
    q('#setup-overlay').classList.remove('hidden')
  }
}

q('#setup-save-btn').addEventListener('click', async () => {
  const btn = q('#setup-save-btn')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Saving…'

  const payload = {
    serverUrl: q('#setup-server-url').value.trim(),
    wsUrl:     q('#setup-server-url').value.trim().replace(/^http/, 'ws') + '/ws',
    wsSecret:  q('#setup-ws-secret').value.trim(),
    agentId:   q('#setup-agent-id').value.trim(),
  }

  if (!payload.serverUrl || !payload.wsSecret || !payload.agentId) {
    showSetupError('Please fill in all required fields.')
    btn.disabled = false
    btn.innerHTML = 'Save &amp; Connect'
    return
  }

  await cp.invoke('settings:set-all', payload)
  const r = await cp.invoke('agent:start')

  if (r.error) {
    showSetupError(r.error)
    btn.disabled = false
    btn.innerHTML = 'Save &amp; Connect'
    return
  }

  q('#setup-overlay').classList.add('hidden')
  await loadSettings()
})

function showSetupError(msg) {
  const el = q('#setup-error')
  el.textContent = msg
  el.style.display = 'flex'
}

// ─────────────────────────────────────────────────────────────
// Auto-updater UI
// ─────────────────────────────────────────────────────────────
cp.on('updater:available', (info) => {
  const banner = q('#update-banner')
  q('#update-title').textContent = `Update available: v${info.version}`
  q('#update-desc').textContent = 'Downloading in the background…'
  q('#update-progress-bar').style.display = 'block'
  banner.classList.remove('hidden')
})

cp.on('updater:progress', ({ percent }) => {
  q('#update-progress-fill').style.width = `${percent}%`
  q('#update-desc').textContent = `Downloading… ${percent}%`
})

cp.on('updater:downloaded', (info) => {
  q('#update-title').textContent = `v${info.version} ready to install`
  q('#update-desc').textContent = 'Will be installed when you restart the app.'
  q('#update-progress-bar').style.display = 'none'
  q('#update-install-btn').style.display = 'inline-flex'
})

cp.on('updater:not-available', () => {
  // Don't show banner for "up to date"
})

q('#update-install-btn').addEventListener('click', () => {
  cp.send('updater:install-now')
})

// ─────────────────────────────────────────────────────────────
// Load recent logs on startup
// ─────────────────────────────────────────────────────────────
async function loadRecentLogs() {
  const entries = await cp.invoke('logs:recent', 300)
  for (const entry of entries) appendLogEntry(entry)
}

// ─────────────────────────────────────────────────────────────
// Load job history on startup
// ─────────────────────────────────────────────────────────────
async function loadJobHistory() {
  const jobs = await cp.invoke('agent:job-history')
  for (const job of jobs) prependJobItem(job)
  const completed = jobs.filter(j => j.status === 'COMPLETED').length
  const failed    = jobs.filter(j => j.status === 'FAILED').length
  completedCount = completed
  failedCount    = failed
  q('#stat-completed').textContent = completed
  q('#stat-failed').textContent    = failed
}

// ─────────────────────────────────────────────────────────────
// Toast notification (in-app)
// ─────────────────────────────────────────────────────────────
function showToast(msg) {
  let toast = q('#toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'toast'
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '12px 18px',
      fontSize: '13px',
      color: 'var(--text)',
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      zIndex: '9999',
      animation: 'slide-in .2s ease',
    })
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.style.display = 'block'
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => { toast.style.display = 'none' }, 3500)
}

// ─────────────────────────────────────────────────────────────
// Security: escape HTML to prevent XSS from job titles
// ─────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────
async function init() {
  // App version
  const version = await cp.invoke('app:version')
  q('#app-version').textContent = `v${version}`
  q('#footer-version').textContent = `v${version}`

  // Load settings
  await loadSettings()

  // Load logs
  await loadRecentLogs()

  // Load job history
  await loadJobHistory()

  // Load printers (status tab shows count)
  const printers = await cp.invoke('printers:list')
  q('#stat-printers').textContent = printers.length
  await populatePrinterDropdown(printers)

  // Check if agent is already running
  const state = await cp.invoke('agent:state')
  if (state.running) {
    setStatus(state.printing ? 'printing' : 'online', 'Agent running')
    if (state.wsConnected) {
      const badge = q('#ws-badge')
      badge.textContent = 'WS Connected'
      badge.className = 'badge badge-green'
    }
  } else {
    setStatus('offline', 'Agent is not running')
  }

  // Show setup wizard if not configured
  await checkSetupNeeded()
}

init().catch(err => {
  console.error('Init failed:', err)
})
