/**
 * CloudPrint Agent
 * Runs on the PC connected to your USB printer.
 * Connects to your CloudPrint server via WebSocket and handles print jobs.
 *
 * Setup:
 *   1. npm install
 *   2. Edit the config section below
 *   3. node agent.js
 */
const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { print, getPrinters } = require('pdf-to-printer')

// ============================================================
// CONFIGURE THESE VALUES (Or load via environment variables)
// ============================================================
// WARNING: If you push this to a public repository (GitHub),
// DO NOT commit your real WS_SECRET here. Instead, set the WS_SECRET
// environment variable when running the agent, or load it from a .env file.
const AGENT_ID     = process.env.AGENT_ID     || 'my-home-printer'          // Must match what you entered in the web app
const WS_URL       = process.env.WS_URL       || 'ws://localhost:3000/ws'    // Change to your deployed URL in production
const WS_SECRET    = process.env.WS_SECRET    || 'e2985ee9693133dd72c4702da4a73e8b469f92cffd5bf25e'  // Must match WS_SECRET in .env.local/WS_SECRET
const PRINTER_NAME = process.env.PRINTER_NAME || ''                          // Leave blank to use system default. Or set exact printer name.
// ============================================================

let ws
let reconnectDelay = 2000
let heartbeatTimer

function connect() {
  const url = `${WS_URL}?agentId=${encodeURIComponent(AGENT_ID)}&secret=${encodeURIComponent(WS_SECRET)}`
  console.log(`[CloudPrint Agent] Connecting to ${WS_URL}…`)
  ws = new WebSocket(url)

  ws.on('open', async () => {
    console.log('[CloudPrint Agent] ✓ Connected to server')
    reconnectDelay = 2000

    // List available printers on startup
    try {
      const printers = await getPrinters()
      console.log(`[CloudPrint Agent] Available printers (${printers.length}):`)
      printers.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}${p.isDefault ? ' (default)' : ''}`))
      if (PRINTER_NAME) {
        const found = printers.find(p => p.name === PRINTER_NAME)
        if (!found) console.warn(`[CloudPrint Agent] ⚠️  Printer "${PRINTER_NAME}" not found — will use system default`)
      }
    } catch (e) {
      console.warn('[CloudPrint Agent] Could not list printers:', e.message)
    }

    // Start heartbeat
    heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'HEARTBEAT', agentId: AGENT_ID }))
      }
    }, 30_000)
  })

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      console.log(`[CloudPrint Agent] ← ${msg.type}`)

      if (msg.type === 'PRINT_JOB') {
        await handlePrintJob(msg.job)
      }
      if (msg.type === 'CANCEL_JOB') {
        console.log(`[CloudPrint Agent] Cancel requested for job ${msg.jobId} (in-progress jobs cannot be cancelled)`)
      }
      if (msg.type === 'PONG') {
        // heartbeat acknowledged
      }
    } catch (e) {
      console.error('[CloudPrint Agent] Message parse error:', e.message)
    }
  })

  ws.on('close', (code, reason) => {
    clearInterval(heartbeatTimer)
    console.log(`[CloudPrint Agent] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s…`)
    setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000)
  })

  ws.on('error', (err) => {
    console.error('[CloudPrint Agent] WebSocket error:', err.message)
  })
}

async function handlePrintJob(job) {
  console.log(`\n[CloudPrint Agent] ▶ Job received: "${job.title}" (${job.id})`)
  sendStatus(job.id, 'PRINTING')

  // Determine file extension
  const extMap = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'text/plain': 'txt',
  }
  const ext = extMap[job.fileType] || 'pdf'
  const tmpFile = path.join(os.tmpdir(), `cloudprint-${job.id}.${ext}`)

  try {
    // 1. Download the file
    console.log(`[CloudPrint Agent]   Downloading file…`)
    const { default: fetch } = await import('node-fetch')
    const res = await fetch(job.fileUrl)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()
    fs.writeFileSync(tmpFile, Buffer.from(buffer))
    console.log(`[CloudPrint Agent]   Downloaded to ${tmpFile}`)

    // 2. Build print options
    const printOptions = {
      copies: job.copies || 1,
      ...(PRINTER_NAME && { printer: PRINTER_NAME }),
      ...(job.paperSize && {
        paperSize: job.paperSize === 'LETTER' ? 'letter'
                 : job.paperSize === 'LEGAL'  ? 'legal'
                 : job.paperSize.toLowerCase(),
      }),
      ...(job.orientation && {
        orientation: job.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait',
      }),
      ...(job.colorMode && {
        monochrome: job.colorMode === 'MONOCHROME',
      }),
    }

    // 3. Print
    console.log(`[CloudPrint Agent]   Printing with options:`, JSON.stringify(printOptions))
    await print(tmpFile, printOptions)
    console.log(`[CloudPrint Agent] ✓ Job ${job.id} printed successfully`)
    sendStatus(job.id, 'COMPLETED')
  } catch (err) {
    console.error(`[CloudPrint Agent] ✗ Job ${job.id} failed:`, err.message)
    sendStatus(job.id, 'FAILED', err.message)
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

function sendStatus(jobId, status, error) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'JOB_STATUS', jobId, status, ...(error && { error }) }))
    console.log(`[CloudPrint Agent] → JOB_STATUS ${jobId} = ${status}`)
  }
}

// Start the agent
console.log('╔═══════════════════════════════╗')
console.log('║     CloudPrint Agent v1.0     ║')
console.log('╚═══════════════════════════════╝')
console.log(`Agent ID : ${AGENT_ID}`)
console.log(`Server   : ${WS_URL}`)
console.log('')
connect()
