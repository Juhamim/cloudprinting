import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  await prisma.printer.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
