import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendToAgent } from '@/lib/websocket'
import { deleteFile } from '@/lib/r2'

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

  const body = await req.json()
  const { title, fileUrl, fileKey, fileType, fileSize, printerId, copies, colorMode, paperSize, orientation, priority } = body

  if (!title || !fileUrl || !printerId) {
    return NextResponse.json({ error: 'title, fileUrl, and printerId are required' }, { status: 400 })
  }

  // Find printer
  const printer = await prisma.printer.findFirst({
    where: { id: printerId },
  })
  if (!printer) return NextResponse.json({ error: 'Printer not found' }, { status: 404 })

  // Determine owner of the job
  const userId = session?.user?.id || printer.userId

  // Prefix job title for guests
  const isAnonymous = !session?.user?.id
  const finalTitle = isAnonymous ? `[Guest] ${title}` : title

  const job = await prisma.printJob.create({
    data: {
      title: finalTitle,
      fileUrl,
      fileKey: fileKey || null,
      fileType: fileType || 'application/pdf',
      fileSize: fileSize || 0,
      printerId,
      userId,
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

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || 'all' // 'all' or 'completed'

  const where = {
    userId: session.user.id,
    ...(scope === 'completed'
      ? { status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] as never[] } }
      : {}),
  }

  // Find matching jobs
  const jobs = await prisma.printJob.findMany({
    where,
    include: { printer: true },
  })

  // Delete files from R2 and cancel active jobs on agent
  for (const job of jobs) {
    if (job.fileKey) {
      try {
        await deleteFile(job.fileKey)
      } catch (err) {
        console.error(`Failed to delete file from R2 for job ${job.id}:`, err)
      }
    }
    if (['QUEUED', 'PROCESSING', 'PRINTING'].includes(job.status)) {
      try {
        sendToAgent(job.printer.agentId, { type: 'CANCEL_JOB', jobId: job.id })
      } catch (err) {
        console.error(`Failed to send cancel to agent for job ${job.id}:`, err)
      }
    }
  }

  const result = await prisma.printJob.deleteMany({ where })
  return NextResponse.json({ success: true, count: result.count })
}
