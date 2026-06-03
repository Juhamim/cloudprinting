import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Helper to authenticate request either by session or WS_SECRET
async function authenticateRequest(req: NextRequest, agentId?: string | null, jobId?: string | null) {
  const session = await auth()
  let userId = session?.user?.id

  if (!userId) {
    // Check Authorization header or query parameter
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret') || req.headers.get('Authorization')?.replace('Bearer ', '')
    const wsSecret = process.env.WS_SECRET

    if (secret && wsSecret && secret === wsSecret) {
      if (agentId) {
        // Authenticating for a specific printer (exact match or prefix)
        const printer = await prisma.printer.findFirst({
          where: {
            OR: [
              { agentId },
              { agentId: { startsWith: `${agentId}:` } }
            ]
          }
        })
        if (printer) {
          userId = printer.userId
        } else {
          // If printer is not registered yet (first run), find the first admin/user in the system
          const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } }) || await prisma.user.findFirst()
          if (user) userId = user.id
        }
      } else if (jobId) {
        // Authenticating for a specific job
        const job = await prisma.printJob.findUnique({ where: { id: jobId } })
        if (job) userId = job.userId
      }
    }
  }

  return userId
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')

  if (!agentId) {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
  }

  // Authenticate (Session or WS_SECRET)
  const userId = await authenticateRequest(req, agentId, null)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify printer belongs to the authorized user (either exact or prefixed agentId)
  const printers = await prisma.printer.findMany({
    where: {
      userId,
      OR: [
        { agentId },
        { agentId: { startsWith: `${agentId}:` } }
      ]
    },
  })

  if (printers.length === 0) {
    return NextResponse.json({ job: null })
  }

  const printerIds = printers.map((p) => p.id)

  // 1. Heartbeat: Update printer status and lastSeen for all connected printers
  // Keep BUSY printers busy, update others to ONLINE
  await prisma.printer.updateMany({
    where: { id: { in: printerIds }, NOT: { status: 'BUSY' } },
    data: {
      status: 'ONLINE',
      lastSeen: new Date(),
    },
  })

  await prisma.printer.updateMany({
    where: { id: { in: printerIds }, status: 'BUSY' },
    data: {
      lastSeen: new Date(),
    },
  })

  // 2. Poll: Find the oldest QUEUED job for any of these printers
  const job = await prisma.printJob.findFirst({
    where: {
      printerId: { in: printerIds },
      status: 'QUEUED',
    },
    include: {
      printer: true,
    },
    orderBy: {
      createdAt: 'asc', // FIFO
    },
  })

  return NextResponse.json({ job })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { jobId, status, error, secret } = body

  if (!jobId || !status) {
    return NextResponse.json({ error: 'jobId and status are required' }, { status: 400 })
  }

  // Inject secret from body into request context for authentication helper
  const userId = await authenticateRequest(req, null, jobId)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify job belongs to this user
  const job = await prisma.printJob.findFirst({
    where: { id: jobId, userId },
    include: { printer: true },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 })
  }

  // Update the job status
  const updatedJob = await prisma.printJob.update({
    where: { id: jobId },
    data: {
      status,
      ...(error && { errorMsg: error }),
      ...(status === 'PROCESSING' && { startedAt: new Date() }),
      ...(status === 'COMPLETED' && { completedAt: new Date() }),
    },
  })

  // Update corresponding printer status
  let printerStatus = 'ONLINE'
  if (status === 'PROCESSING' || status === 'PRINTING') {
    printerStatus = 'BUSY'
  } else if (status === 'FAILED') {
    printerStatus = 'ONLINE'
  }

  await prisma.printer.update({
    where: { id: job.printerId },
    data: {
      status: printerStatus as never,
      lastSeen: new Date(),
    },
  })

  return NextResponse.json({ success: true, job: updatedJob })
}
