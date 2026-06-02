/**
 * CloudPrint Agent (HTTP Polling Background Daemon)
 * Runs on the PC connected to your USB printer.
 * Connects to your CloudPrint server via HTTP Polling and handles print jobs.
 * 
 * Setup:
 *   1. npm install
 *   2. Configure (loads from root .env.local or local .env)
 *   3. Run with: node agent.js
 *   4. Set up as invisible background Windows service using install.bat
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { print, getPrinters } = require('pdf-to-printer')
const PDFDocument = require('pdfkit')

// ============================================================
// DUAL-LOGGING & ROTATION SYSTEM
// ============================================================
const logFile = path.join(__dirname, 'agent.log')

// Rotate logs on startup if file is too large (> 5MB)
try {
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile)
    if (stats.size > 5 * 1024 * 1024) {
      if (fs.existsSync(logFile + '.old')) {
        fs.unlinkSync(logFile + '.old')
      }
      fs.renameSync(logFile, logFile + '.old')
    }
  }
} catch (e) {
  // ignore log rotation error
}

const logStream = fs.createWriteStream(logFile, { flags: 'a' })

const originalLog = console.log
const originalError = console.error
const originalWarn = console.warn

function formatMessage(args) {
  return args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
}

console.log = function(...args) {
  const msg = formatMessage(args)
  const timestamp = new Date().toISOString()
  logStream.write(`[${timestamp}] [INFO] ${msg}\n`)
  originalLog.apply(console, args)
}

console.error = function(...args) {
  const msg = formatMessage(args)
  const timestamp = new Date().toISOString()
  logStream.write(`[${timestamp}] [ERROR] ${msg}\n`)
  originalError.apply(console, args)
}

console.warn = function(...args) {
  const msg = formatMessage(args)
  const timestamp = new Date().toISOString()
  logStream.write(`[${timestamp}] [WARN] ${msg}\n`)
  originalWarn.apply(console, args)
}

// ============================================================
// ENVIRONMENT VARIABLES LOADER
// ============================================================
function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '.env')
  ];
  let loaded = false;
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
          if (line.trim().startsWith('#') || !line.includes('=')) return;
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
            if (process.env[key] === undefined) {
              process.env[key] = value.trim();
            }
          }
        });
        console.log(`[CloudPrint] Loaded environment variables from: ${path.basename(envPath)}`);
        loaded = true;
        break;
      } catch (err) {
        originalWarn.call(console, `[CloudPrint] Failed to load env file ${envPath}:`, err.message);
      }
    }
  }
  if (!loaded) {
    console.log('[CloudPrint] No external env configuration found, using hardcoded/process defaults.');
  }
}

// Load env before resolving config
loadEnv()

function convertImageToPdf(imagePath, pdfPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 })
      const stream = fs.createWriteStream(pdfPath)
      
      doc.pipe(stream)
      
      // A4 is 595.28 x 841.89 points
      doc.image(imagePath, 0, 0, {
        fit: [595.28, 841.89],
        align: 'center',
        valign: 'center'
      })
      
      doc.end()
      
      stream.on('finish', () => resolve(pdfPath))
      stream.on('error', (err) => reject(err))
    } catch (err) {
      reject(err)
    }
  })
}

// ============================================================
// CONFIGURE THESE VALUES (Or load via environment variables)
// ============================================================
const AGENT_ID     = process.env.AGENT_ID     || 'my-home-printer'
const WS_URL       = process.env.WS_URL       || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws'
const WS_SECRET    = process.env.WS_SECRET    || 'e2985ee9693133dd72c4702da4a73e8b469f92cffd5bf25e'
const PRINTER_NAME = process.env.PRINTER_NAME || ''                          // Leave blank to use system default. Or set exact printer name.
// ============================================================

// Convert WS URL to HTTP API endpoint automatically
let baseUrl = process.env.SERVER_URL || WS_URL
if (baseUrl.startsWith('ws://')) {
  baseUrl = baseUrl.replace('ws://', 'http://')
} else if (baseUrl.startsWith('wss://')) {
  baseUrl = baseUrl.replace('wss://', 'https://')
}
baseUrl = baseUrl.replace(/\/ws$/, '').replace(/\/$/, '')
const API_URL = `${baseUrl}/api/receiver`

let nodeFetch
async function getFetch() {
  if (!nodeFetch) {
    const module = await import('node-fetch')
    nodeFetch = module.default
  }
  return nodeFetch
}

let isPolling = false
let isPrinting = false

async function start() {
  console.log('╔═══════════════════════════════╗')
  console.log('║     CloudPrint Agent v1.1     ║')
  console.log('║   (Background HTTP Polling)   ║')
  console.log('╚═══════════════════════════════╝')
  console.log(`Agent ID : ${AGENT_ID}`)
  console.log(`Server   : ${baseUrl}`)
  console.log(`API URL  : ${API_URL}`)
  console.log('')

  // List available printers on startup (non-blocking)
  getPrinters()
    .then((printers) => {
      console.log(`[CloudPrint] Available printers (${printers.length}):`)
      printers.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}${p.isDefault ? ' (default)' : ''}`))
      if (PRINTER_NAME) {
        const found = printers.find((p) => p.name === PRINTER_NAME)
        if (!found) console.warn(`[CloudPrint] ⚠️  Printer "${PRINTER_NAME}" not found — will use system default`)
      }
    })
    .catch((e) => {
      console.warn('[CloudPrint] Could not list printers:', e.message)
    })

  console.log(`\n[CloudPrint] Starting background poll loop (every 3 seconds)…`)
  
  // Initial poll
  await poll()
  
  // Run interval (check for new jobs every 1.5 seconds when idle)
  setInterval(poll, 1500)
}

async function poll() {
  if (isPolling || isPrinting) return
  isPolling = true

  try {
    const fetch = await getFetch()
    const url = `${API_URL}?agentId=${encodeURIComponent(AGENT_ID)}&secret=${encodeURIComponent(WS_SECRET)}`
    
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 401) {
        console.error(`[CloudPrint] ✗ Unauthorized! Check if your WS_SECRET matches the server.`)
      } else {
        console.error(`[CloudPrint] ✗ Server error (HTTP ${res.status}): ${res.statusText}`)
      }
      return
    }

    const { job } = await res.json()
    if (job) {
      isPrinting = true
      await handlePrintJob(job)
      isPrinting = false
      // Poll again immediately to check for more jobs in the queue
      setTimeout(poll, 50)
    }
  } catch (e) {
    console.error('[CloudPrint] Connection error during poll:', e.message)
  } finally {
    isPolling = false
  }
}

async function handlePrintJob(job) {
  console.log(`\n[CloudPrint] ▶ Job received: "${job.title}" (${job.id})`)
  await sendStatus(job.id, 'PRINTING')

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
  let fileToPrint = tmpFile
  let convertedPdfFile = null

  try {
    // 1. Download the file
    console.log(`[CloudPrint]   Downloading file…`)
    const fetch = await getFetch()
    const res = await fetch(job.fileUrl)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()
    fs.writeFileSync(tmpFile, Buffer.from(buffer))
    console.log(`[CloudPrint]   Downloaded to ${tmpFile}`)

    // 1.5 Convert images to PDF on the fly to prevent blank page issues in SumatraPDF
    const isImage = ['jpg', 'jpeg', 'png'].includes(ext)
    if (isImage) {
      console.log(`[CloudPrint]   Detected image format. Converting to PDF on the fly…`)
      convertedPdfFile = path.join(os.tmpdir(), `cloudprint-${job.id}-converted.pdf`)
      await convertImageToPdf(tmpFile, convertedPdfFile)
      fileToPrint = convertedPdfFile
      console.log(`[CloudPrint]   Successfully converted image to PDF: ${convertedPdfFile}`)
    }

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
      ...(job.pages && {
        pages: job.pages,
      }),
    }

    if (job.pagesPerSheet && job.pagesPerSheet > 1) {
      console.log(`[CloudPrint]   Pages Per Sheet requested: ${job.pagesPerSheet} (SumatraPDF printing defaults to printer driver settings for layout)`)
    }

    // 3. Print
    console.log(`[CloudPrint]   Printing with options:`, JSON.stringify(printOptions))
    await print(fileToPrint, printOptions)
    console.log(`[CloudPrint] ✓ Job ${job.id} printed successfully`)
    await sendStatus(job.id, 'COMPLETED')
  } catch (err) {
    console.error(`[CloudPrint] ✗ Job ${job.id} failed:`, err.message)
    await sendStatus(job.id, 'FAILED', err.message)
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
      if (convertedPdfFile && fs.existsSync(convertedPdfFile)) fs.unlinkSync(convertedPdfFile)
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

async function sendStatus(jobId, status, error) {
  try {
    const fetch = await getFetch()
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WS_SECRET}`
      },
      body: JSON.stringify({
        jobId,
        status,
        secret: WS_SECRET,
        ...(error && { error })
      })
    })
    
    if (res.ok) {
      console.log(`[CloudPrint] → Status updated: ${status}`)
    } else {
      console.error(`[CloudPrint] ✗ Failed to update status on server (HTTP ${res.status})`)
    }
  } catch (e) {
    console.error('[CloudPrint] Connection error while updating status:', e.message)
  }
}

// Start the agent
start()
