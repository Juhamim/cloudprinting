import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/r2'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const printer = await prisma.printer.findFirst({
    where: { id, userId: session.user.id },
    include: { printJobs: { orderBy: { createdAt: 'desc' }, take: 10 } },
  })
  if (!printer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(printer)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const printer = await prisma.printer.findFirst({ where: { id, userId: session.user.id } })
  if (!printer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.printer.update({ where: { id }, data: body })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const printer = await prisma.printer.findFirst({ where: { id, userId: session.user.id } })
  if (!printer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find all jobs associated with this printer
  const jobs = await prisma.printJob.findMany({
    where: { printerId: id },
  })

  // Delete all job files from R2
  for (const job of jobs) {
    if (job.fileKey) {
      try {
        await deleteFile(job.fileKey)
      } catch (err) {
        console.error(`Failed to delete file from R2 for job ${job.id}:`, err)
      }
    }
  }

  // Delete the jobs from database
  await prisma.printJob.deleteMany({
    where: { printerId: id },
  })

  // Finally delete the printer
  await prisma.printer.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
