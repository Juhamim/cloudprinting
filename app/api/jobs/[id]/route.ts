import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendToAgent } from '@/lib/websocket'

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

  const job = await prisma.printJob.findFirst({
    where: { id, userId: session.user.id },
    include: { printer: true },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cancel on agent if still queued/processing
  if (['QUEUED', 'PROCESSING'].includes(job.status)) {
    sendToAgent(job.printer.agentId, { type: 'CANCEL_JOB', jobId: id })
    await prisma.printJob.update({ where: { id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ success: true, status: 'CANCELLED' })
  }

  await prisma.printJob.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
