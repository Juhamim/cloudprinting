/**
 * CloudPrint Agent — Printer Manager
 * Wraps pdf-to-printer for discovery, routing and image→PDF conversion.
 */

const fs    = require('fs')
const path  = require('path')
const os    = require('os')
const { print, getPrinters, getDefaultPrinter } = require('pdf-to-printer')
const PDFDocument = require('pdfkit')
const logger = require('./logger').child('Printer')

// ─────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────

/**
 * Return the full list of local printers.
 * @returns {Promise<Array<{name:string, deviceId:string, isDefault:boolean}>>}
 */
async function listPrinters() {
  const [printers, def] = await Promise.all([
    getPrinters(),
    getDefaultPrinter().catch(() => null),
  ])
  const defName = def?.name || ''
  return printers.map(p => ({
    name: p.name,
    deviceId: p.deviceId || p.name,
    paperSizes: p.paperSizes || [],
    isDefault: p.name === defName,
  }))
}

/**
 * Return the default system printer name.
 * @returns {Promise<string>}
 */
async function getDefaultPrinterName() {
  const def = await getDefaultPrinter().catch(() => null)
  return def?.name || ''
}

// ─────────────────────────────────────────────────────────────
// Image → PDF conversion
// ─────────────────────────────────────────────────────────────

/**
 * Convert a JPEG/PNG image to a PDF that fills an A4 page.
 * @param {string} imagePath
 * @param {string} pdfPath
 * @returns {Promise<string>} resolved pdfPath
 */
function convertImageToPdf(imagePath, pdfPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true })
      const stream = fs.createWriteStream(pdfPath)
      doc.pipe(stream)
      // A4 = 595.28 x 841.89 points
      doc.image(imagePath, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' })
      doc.end()
      stream.on('finish', () => resolve(pdfPath))
      stream.on('error', reject)
    } catch (err) {
      reject(err)
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Test page
// ─────────────────────────────────────────────────────────────

/**
 * Generate a printer-identification test page PDF.
 * @param {string} printerName
 * @param {string} agentId
 * @returns {Promise<string>} path to temporary PDF
 */
async function generateTestPage(printerName, agentId) {
  const tmpFile = path.join(os.tmpdir(), `cloudprint-test-${Date.now()}.pdf`)
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 60 })
      const stream = fs.createWriteStream(tmpFile)
      doc.pipe(stream)

      doc.fontSize(28).fillColor('#1d4ed8').text('CloudPrint Agent', { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(14).fillColor('#374151').text('Printer Identification Test Page', { align: 'center' })
      doc.moveDown(1)
      doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#d1d5db').stroke()
      doc.moveDown(1)

      const rows = [
        ['Printer Name', printerName],
        ['Agent ID',     agentId],
        ['Date',         new Date().toLocaleString()],
        ['Status',       'ONLINE'],
      ]

      doc.fontSize(12).fillColor('#111827')
      for (const [label, value] of rows) {
        doc.text(`${label}:`, { continued: true, width: 180 })
           .fillColor('#1d4ed8').text(`  ${value}`, { fillColor: '#1d4ed8' })
        doc.fillColor('#111827').moveDown(0.6)
      }

      doc.moveDown(2)
      doc.fontSize(10).fillColor('#9ca3af').text(
        'This page was sent by CloudPrint Agent to identify your printer connection.',
        { align: 'center' }
      )

      doc.end()
      stream.on('finish', () => resolve(tmpFile))
      stream.on('error', reject)
    } catch (err) {
      reject(err)
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Core print function
// ─────────────────────────────────────────────────────────────

/**
 * Download a file, convert if needed, and send to the printer.
 * @param {object} job  — PrintJob record from server
 * @param {string} [overridePrinterName] — target printer name (from agentId routing)
 * @param {Function} fetchFn — node-fetch compatible function
 * @returns {Promise<void>}
 */
async function executePrintJob(job, overridePrinterName, fetchFn) {
  const extMap = {
    'application/pdf':  'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'text/plain': 'txt',
  }
  const ext = extMap[job.fileType] || 'pdf'
  const tmpFile = path.join(os.tmpdir(), `cloudprint-${job.id}.${ext}`)
  let fileToPrint = tmpFile
  let convertedPdf = null

  try {
    // 1. Download
    logger.info(`Downloading: ${job.fileUrl}`)
    const res = await fetchFn(job.fileUrl)
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()
    fs.writeFileSync(tmpFile, Buffer.from(buffer))
    logger.info(`Saved to ${tmpFile} (${buffer.byteLength} bytes)`)

    // 2. Convert images to PDF
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      convertedPdf = path.join(os.tmpdir(), `cloudprint-${job.id}-converted.pdf`)
      await convertImageToPdf(tmpFile, convertedPdf)
      fileToPrint = convertedPdf
      logger.info(`Converted image → PDF: ${convertedPdf}`)
    }

    // 3. Build print options
    const printOptions = {
      copies: job.copies || 1,
      ...(overridePrinterName && { printer: overridePrinterName }),
      ...(job.paperSize && {
        paperSize: job.paperSize === 'LETTER' ? 'letter'
                 : job.paperSize === 'LEGAL'  ? 'legal'
                 : job.paperSize.toLowerCase(),
      }),
      ...(job.orientation && {
        orientation: job.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait',
      }),
      ...(job.colorMode && { monochrome: job.colorMode === 'MONOCHROME' }),
      ...(job.pages && { pages: job.pages }),
    }

    logger.info(`Printing with options: ${JSON.stringify(printOptions)}`)
    await print(fileToPrint, printOptions)
    logger.info(`✓ Job ${job.id} printed successfully`)
  } finally {
    // Cleanup temp files
    for (const f of [tmpFile, convertedPdf]) {
      if (f && fs.existsSync(f)) {
        try { fs.unlinkSync(f) } catch (_) {}
      }
    }
  }
}

/**
 * Print a test/identification page to a specific printer.
 * @param {string} printerName
 * @param {string} agentId
 * @returns {Promise<void>}
 */
async function printTestPage(printerName, agentId) {
  const pdfPath = await generateTestPage(printerName, agentId)
  try {
    await print(pdfPath, { printer: printerName })
    logger.info(`✓ Test page printed on "${printerName}"`)
  } finally {
    try { fs.unlinkSync(pdfPath) } catch (_) {}
  }
}

module.exports = {
  listPrinters,
  getDefaultPrinterName,
  executePrintJob,
  printTestPage,
}
