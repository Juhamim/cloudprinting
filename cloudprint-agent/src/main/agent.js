/**
 * CloudPrint Agent — Core Agent
 * 
 * Responsibilities:
 *  1. Register / sync local printers with the server (POST /api/receiver/sync)
 *  2. Poll the server for pending print jobs (GET /api/receiver)
 *  3. Download, convert, and spool jobs to local USB printers
 *  4. Report job status back (POST /api/receiver)
 *  5. Maintain a heartbeat so the server sees the agent as ONLINE
 *  6. Emit rich status events for the IPC / renderer to consume
 * 
 * WebSocket note:
 *  The server can also push jobs over WS.  We connect and fall back to HTTP
 *  polling when WS is unavailable — giving best of both worlds.
 */

const { EventEmitter } = require('events')
const WebSocket = require('ws')
const logger = require('./logger').child('Agent')
const settings = require('./settings')
const { listPrinters, executePrintJob, printTestPage } = require('./printer')

// ─────────────────────────────────────────────────────────────
// Lazy node-fetch loader (ESM-only package)
// ─────────────────────────────────────────────────────────────
let _fetch = null
async function getFetch() {
  if (!_fetch) {
    const m = await import('node-fetch')
    _fetch = m.default
  }
  return _fetch
}

// ─────────────────────────────────────────────────────────────
// Agent class
// ─────────────────────────────────────────────────────────────
class Agent extends EventEmitter {
  constructor() {
    super()
    this.running       = false
    this.polling       = false
    this.printing      = false
    this.ws            = null
    this.wsConnected   = false
    this.pollTimer     = null
    this.syncTimer     = null
    this.wsRetryTimer  = null
    this.reconnectDelay = 2000      // ms, doubles on each failure (max 30 s)
    this._printerHash  = ''         // detect printer list changes
    this.jobHistory    = []         // last 50 completed jobs
  }

  // ──────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────

  async start() {
    if (this.running) return
    this.running = true
    logger.info('Agent starting…')

    // Initial printer sync
    await this._syncPrinters().catch(e => logger.warn('Initial sync failed:', e.message))

    // Connect WebSocket
    this._connectWs()

    // HTTP polling fallback (also primary when WS not available)
    this.pollTimer = setInterval(() => this._poll(), settings.get('pollIntervalMs') || 1500)
    await this._poll()

    // Periodic printer sync (detects plug/unplug)
    this.syncTimer = setInterval(() => this._syncPrinters().catch(() => {}), settings.get('syncIntervalMs') || 10000)

    this.emit('status', { state: 'running' })
    logger.info('Agent running ✓')
  }

  async stop() {
    if (!this.running) return
    this.running = false
    clearInterval(this.pollTimer)
    clearInterval(this.syncTimer)
    clearTimeout(this.wsRetryTimer)
    if (this.ws) {
      try { this.ws.close(1000, 'Agent stopping') } catch (_) {}
      this.ws = null
    }
    this.emit('status', { state: 'stopped' })
    logger.info('Agent stopped')
  }

  // ──────────────────────────────────────────────────────────
  // WebSocket management
  // ──────────────────────────────────────────────────────────

  _connectWs() {
    const wsUrl   = settings.get('wsUrl')
    const secret  = settings.get('wsSecret')
    const agentId = settings.get('agentId')

    if (!wsUrl || !secret || !agentId) {
      logger.warn('WS: Missing config — skipping WS connection (HTTP polling only)')
      return
    }

    const url = `${wsUrl}?agentId=${encodeURIComponent(agentId)}&secret=${encodeURIComponent(secret)}`
    logger.info(`WS: Connecting to ${wsUrl}…`)

    try {
      this.ws = new WebSocket(url, { rejectUnauthorized: false })
    } catch (err) {
      logger.error('WS: Failed to create socket:', err.message)
      this._scheduleWsReconnect()
      return
    }

    this.ws.on('open', () => {
      this.wsConnected = true
      this.reconnectDelay = 2000
      logger.info('WS: Connected ✓')
      this.emit('ws-connected')
    })

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        this._handleWsMessage(msg)
      } catch (err) {
        logger.warn('WS: Unparseable message:', err.message)
      }
    })

    this.ws.on('close', (code, reason) => {
      this.wsConnected = false
      logger.warn(`WS: Closed (${code}) — ${reason || 'no reason'}`)
      this.emit('ws-disconnected')
      if (this.running) this._scheduleWsReconnect()
    })

    this.ws.on('error', (err) => {
      logger.error('WS: Error:', err.message)
      // 'close' event will follow; let it handle reconnect
    })

    // Heartbeat ping every 25 s
    this.ws.on('open', () => {
      const hb = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ type: 'HEARTBEAT' })) } catch (_) {}
        } else {
          clearInterval(hb)
        }
      }, 25000)
    })
  }

  _scheduleWsReconnect() {
    clearTimeout(this.wsRetryTimer)
    const delay = Math.min(this.reconnectDelay, 30000)
    logger.info(`WS: Reconnecting in ${delay / 1000}s…`)
    this.wsRetryTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
      this._connectWs()
    }, delay)
  }

  async _handleWsMessage(msg) {
    logger.debug('WS msg:', msg.type)

    if (msg.type === 'PRINT_JOB' && msg.job) {
      // Server pushed a job — process immediately
      this.printing = true
      try {
        await this._handlePrintJob(msg.job)
      } finally {
        this.printing = false
      }
      return
    }

    if (msg.type === 'PING_PRINTER') {
      // Admin requested a test page to identify a printer
      const job = msg
      const printerName = this._resolvePrinterName(job.agentId || settings.get('agentId'))
      try {
        await printTestPage(printerName, settings.get('agentId'))
        logger.info(`Test page printed on "${printerName}"`)
        this.emit('test-page-printed', { printerName })
      } catch (err) {
        logger.error('Test page failed:', err.message)
      }
      return
    }

    if (msg.type === 'PONG') {
      // Heartbeat ack — no action needed
    }
  }

  // ──────────────────────────────────────────────────────────
  // HTTP Polling
  // ──────────────────────────────────────────────────────────

  async _poll() {
    if (!this.running || this.polling || this.printing) return
    this.polling = true

    try {
      const fetch   = await getFetch()
      const server  = settings.get('serverUrl')
      const secret  = settings.get('wsSecret')
      const agentId = settings.get('agentId')

      if (!server || !secret || !agentId) return

      const url = `${server}/api/receiver?agentId=${encodeURIComponent(agentId)}&secret=${encodeURIComponent(secret)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })

      if (!res.ok) {
        if (res.status === 401) logger.error('Poll: Unauthorized — check WS_SECRET')
        else logger.warn(`Poll: HTTP ${res.status}`)
        this.emit('status', { state: 'error', error: `HTTP ${res.status}` })
        return
      }

      this.emit('status', { state: 'online' })

      const { job } = await res.json()
      if (job) {
        this.printing = true
        try {
          await this._handlePrintJob(job)
          // Poll again immediately — there might be more queued jobs
          setTimeout(() => this._poll(), 50)
        } finally {
          this.printing = false
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        logger.error('Poll error:', err.message)
        this.emit('status', { state: 'error', error: err.message })
      }
    } finally {
      this.polling = false
    }
  }

  // ──────────────────────────────────────────────────────────
  // Printer sync
  // ──────────────────────────────────────────────────────────

  async _syncPrinters() {
    const fetch   = await getFetch()
    const server  = settings.get('serverUrl')
    const secret  = settings.get('wsSecret')
    const agentId = settings.get('agentId')
    if (!server || !secret || !agentId) return

    const printers = await listPrinters()
    const hash = JSON.stringify(printers.map(p => p.name).sort())

    if (hash === this._printerHash) return // no change
    this._printerHash = hash

    logger.info(`Syncing ${printers.length} printer(s) with server…`)

    const res = await fetch(`${server}/api/receiver/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({ agentId, printers }),
      signal: AbortSignal.timeout(10000),
    })

    if (res.ok) {
      logger.info(`✓ Printer sync OK (${printers.length} registered)`)
      this.emit('printers-synced', printers)
    } else {
      logger.warn(`Printer sync HTTP ${res.status}`)
    }
  }

  // ──────────────────────────────────────────────────────────
  // Job execution
  // ──────────────────────────────────────────────────────────

  async _handlePrintJob(job) {
    logger.info(`▶ Job: "${job.title}" (${job.id})`)
    this.emit('job-start', job)
    await this._sendStatus(job.id, 'PRINTING')

    // Resolve which physical printer to use
    const targetPrinterName = this._resolvePrinterName(job.printer?.agentId || settings.get('agentId'))

    try {
      const fetch = await getFetch()
      await executePrintJob(job, targetPrinterName, fetch)
      await this._sendStatus(job.id, 'COMPLETED')
      logger.info(`✓ Job ${job.id} completed`)
      this._pushHistory({ ...job, status: 'COMPLETED', completedAt: new Date().toISOString() })
      this.emit('job-done', { ...job, status: 'COMPLETED' })
    } catch (err) {
      logger.error(`✗ Job ${job.id} failed:`, err.message)
      await this._sendStatus(job.id, 'FAILED', err.message)
      this._pushHistory({ ...job, status: 'FAILED', errorMsg: err.message })
      this.emit('job-failed', { ...job, status: 'FAILED', errorMsg: err.message })
    }
  }

  /**
   * Extract physical printer name from agentId routing.
   * Format: "baseAgentId:PrinterName" or just "baseAgentId"
   */
  _resolvePrinterName(agentId) {
    const override = settings.get('printerName')
    if (override) return override   // user-forced printer wins

    if (agentId && agentId.includes(':')) {
      return agentId.split(':').slice(1).join(':') // everything after first ':'
    }
    return '' // empty → use system default
  }

  // ──────────────────────────────────────────────────────────
  // Status reporting
  // ──────────────────────────────────────────────────────────

  async _sendStatus(jobId, status, errorMsg) {
    try {
      const fetch  = await getFetch()
      const server = settings.get('serverUrl')
      const secret = settings.get('wsSecret')

      // Prefer WS (lower latency)
      if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'JOB_STATUS', jobId, status, ...(errorMsg && { error: errorMsg }) }))
        return
      }

      // Fall back to HTTP
      await fetch(`${server}/api/receiver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({ jobId, status, secret, ...(errorMsg && { error: errorMsg }) }),
        signal: AbortSignal.timeout(8000),
      })
    } catch (err) {
      logger.error('Status update failed:', err.message)
    }
  }

  // ──────────────────────────────────────────────────────────
  // Job history (ring buffer, last 50)
  // ──────────────────────────────────────────────────────────

  _pushHistory(job) {
    this.jobHistory.unshift(job)
    if (this.jobHistory.length > 50) this.jobHistory.pop()
  }

  getJobHistory() {
    return this.jobHistory
  }

  // ──────────────────────────────────────────────────────────
  // Public diagnostics
  // ──────────────────────────────────────────────────────────

  getState() {
    return {
      running:    this.running,
      printing:   this.printing,
      wsConnected: this.wsConnected,
    }
  }
}

// Singleton
const agent = new Agent()
module.exports = agent
