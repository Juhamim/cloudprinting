import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')

  if (!agentId) {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
  }

  // Verify printer belongs to the logged-in user
  const printer = await prisma.printer.findFirst({
    where: { agentId, userId: session.user.id },
  })

  if (!printer) {
    return NextResponse.json({ error: 'Printer not found or access denied' }, { status: 404 })
  }

  // 1. Heartbeat: Update printer status and lastSeen
  // Note: if the printer is currently busy printing, keep status as BUSY, otherwise set to ONLINE
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
      createdAt: 'asc', // FIFO (First In, First Out)
    },
  })

  return NextResponse.json({ job })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId, status, error } = await req.json()

  if (!jobId || !status) {
    return NextResponse.json({ error: 'jobId and status are required' }, { status: 400 })
  }

  // Verify job belongs to this user
  const job = await prisma.printJob.findFirst({
    where: { id: jobId, userId: session.user.id },
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
    // If the print fails, set to ONLINE so it can accept next jobs
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
