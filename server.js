/**
 * Custom Next.js server with WebSocket support.
 * Run with: node server.js  (instead of next dev)
 * This allows persistent WebSocket connections from the print agent.
 */
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { WebSocketServer } = require('ws')

const fs = require('fs')
const path = require('path')

function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '.env.local'),
    path.join(__dirname, '.env'),
  ]
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8')
        content.split(/\r?\n/).forEach(line => {
          if (line.trim().startsWith('#') || !line.includes('=')) return
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
          if (match) {
            const key = match[1]
            let value = match[2] || ''
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
            if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
            if (process.env[key] === undefined) {
              process.env[key] = value.trim()
            }
          }
        })
        break
      } catch (err) {}
    }
  }
}
loadEnv()

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)
const WS_SECRET = process.env.WS_SECRET || ''

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// In-memory agent registry (same module must be imported by API routes)
// Since Next.js and this server share the same process, they share the module cache.
const agents = new Map()

// Expose globally so Next.js API routes can import this module and share state
global.__cloudprint_agents = agents

app.prepare().then(async () => {
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true)
    await handle(req, res, parsedUrl)
  })

  // Attach WebSocket server
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url, true)
    if (pathname !== '/ws') {
      socket.destroy()
      return
    }

    const { agentId, secret } = query
    const expectedSecret = process.env.WS_SECRET || WS_SECRET
    if (!agentId || secret !== expectedSecret) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, agentId)
    })
  })

  wss.on('connection', async (ws, req, agentId) => {
    console.log(`[WS] Agent connected: ${agentId}`)
    agents.set(agentId, ws)

    try {
      await prisma.printer.updateMany({
        where: { agentId },
        data: { status: 'ONLINE', lastSeen: new Date() },
      })
    } catch (e) { console.error('[WS] DB update error:', e.message) }

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        if (msg.type === 'JOB_STATUS') {
          const { jobId, status, error } = msg
          await prisma.printJob.update({
            where: { id: jobId },
            data: {
              status,
              ...(error && { errorMsg: error }),
              ...(status === 'COMPLETED' && { completedAt: new Date() }),
            },
          })
          await prisma.printer.updateMany({
            where: { agentId },
            data: {
              status: status === 'PRINTING' ? 'BUSY' : 'ONLINE',
              lastSeen: new Date(),
            },
          })
          console.log(`[WS] Job ${jobId} → ${status}`)
        }

        if (msg.type === 'HEARTBEAT') {
          await prisma.printer.updateMany({
            where: { agentId },
            data: { lastSeen: new Date(), status: 'ONLINE' },
          })
          ws.send(JSON.stringify({ type: 'PONG' }))
        }
      } catch (e) {
        console.error('[WS] Message error:', e.message)
      }
    })

    ws.on('close', async () => {
      agents.delete(agentId)
      console.log(`[WS] Agent disconnected: ${agentId}`)
      try {
        await prisma.printer.updateMany({
          where: { agentId },
          data: { status: 'OFFLINE' },
        })
      } catch (e) { console.error('[WS] DB cleanup error:', e.message) }
    })

    ws.on('error', (err) => {
      console.error(`[WS] Agent ${agentId} error:`, err.message)
    })
  })

  server.listen(port, hostname, () => {
    console.log(`> CloudPrint server ready on http://${hostname}:${port}`)
    console.log(`> WebSocket endpoint: ws://${hostname}:${port}/ws`)
  })
})
