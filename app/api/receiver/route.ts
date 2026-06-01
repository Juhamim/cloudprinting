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
        // Authenticating for a specific printer
        const printer = await prisma.printer.findUnique({ where: { agentId } })
        if (printer) userId = printer.userId
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

  // Verify printer belongs to the authorized user
  const printer = await prisma.printer.findFirst({
    where: { agentId, userId },
  })

  if (!printer) {
    return NextResponse.json({ error: 'Printer not found or access denied' }, { status: 404 })
  }

  // 1. Heartbeat: Update printer status and lastSeen
  const currentPrinter = await prisma.printer.findUnique({ where: { id: printer.id } })
  const newStatus = currentPrinter?.status === 'BUSY' ? 'BUSY' : 'ONLINE'

  await prisma.printer.update({
    where: { id: printer.id },
    data: {
      status: newStatus,
      lastSeen: new Date(),
    },
  })

  // 2. Poll: Find the oldest QUEUED job for this printer
  const job = await prisma.printJob.findFirst({
    where: {
      printerId: printer.id,
      status: 'QUEUED',
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
