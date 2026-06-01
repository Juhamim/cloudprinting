import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendToAgent } from '@/lib/websocket'
import { deleteFile } from '@/lib/r2'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const job = await prisma.printJob.findFirst({
    where: { id, userId: session.user.id },
    include: { printer: true },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(job)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const job = await prisma.printJob.findFirst({
    where: { id, userId: session.user.id },
    include: { printer: true },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.printJob.update({ where: { id }, data: body, include: { printer: true } })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { searchParams } = new URL(req.url)
  const fileOnly = searchParams.get('fileOnly') === 'true'

  const job = await prisma.printJob.findFirst({
    where: { id, userId: session.user.id },
    include: { printer: true },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete the file from R2 storage if key exists
  if (job.fileKey) {
    try {
      await deleteFile(job.fileKey)
    } catch (err) {
      console.error(`Failed to delete file from R2 for job ${id}:`, err)
    }
  }

  // If user only wanted to clear the file to save storage
  if (fileOnly) {
    const updated = await prisma.printJob.update({
      where: { id },
      data: {
        fileUrl: '',
        fileKey: null,
      },
      include: { printer: true },
    })
    return NextResponse.json(updated)
  }

  // Cancel on agent if still queued/processing
  if (['QUEUED', 'PROCESSING', 'PRINTING'].includes(job.status)) {
    try {
      sendToAgent(job.printer.agentId, { type: 'CANCEL_JOB', jobId: id })
    } catch (err) {
      console.error(`Failed to send cancel to agent:`, err)
    }
  }

  // Delete the database record
  await prisma.printJob.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
