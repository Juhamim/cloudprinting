import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendToAgent } from '@/lib/websocket'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'))
  const status = searchParams.get('status')

  const where = {
    userId: session.user.id,
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
  }

  const [jobs, total] = await Promise.all([
    prisma.printJob.findMany({
      where,
      include: { printer: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.printJob.count({ where }),
  ])

  return NextResponse.json({ jobs, total, page, limit, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, fileUrl, fileKey, fileType, fileSize, printerId, copies, colorMode, paperSize, orientation, priority } = body

  if (!title || !fileUrl || !printerId) {
    return NextResponse.json({ error: 'title, fileUrl, and printerId are required' }, { status: 400 })
  }

  // Verify printer belongs to this user
  const printer = await prisma.printer.findFirst({
    where: { id: printerId, userId: session.user.id },
  })
  if (!printer) return NextResponse.json({ error: 'Printer not found' }, { status: 404 })

  const job = await prisma.printJob.create({
    data: {
      title,
      fileUrl,
      fileKey: fileKey || null,
      fileType: fileType || 'application/pdf',
      fileSize: fileSize || 0,
      printerId,
      userId: session.user.id,
      copies: copies || 1,
      colorMode: colorMode || 'MONOCHROME',
      paperSize: paperSize || 'A4',
      orientation: orientation || 'PORTRAIT',
      priority: priority || 'NORMAL',
      status: 'QUEUED',
    },
    include: { printer: true },
  })

  // Dispatch to print agent via WebSocket
  const dispatched = sendToAgent(printer.agentId, {
    type: 'PRINT_JOB',
    job: {
      id: job.id,
      fileUrl: job.fileUrl,
      fileType: job.fileType,
      title: job.title,
      copies: job.copies,
      colorMode: job.colorMode,
      paperSize: job.paperSize,
      orientation: job.orientation,
    },
  })

  if (dispatched) {
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', startedAt: new Date() },
    })
    await prisma.printer.update({
      where: { id: printerId },
      data: { status: 'BUSY' },
    })
  }

  return NextResponse.json({ ...job, dispatched }, { status: 201 })
}
