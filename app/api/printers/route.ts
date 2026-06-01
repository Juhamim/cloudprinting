import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const printers = await prisma.printer.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(printers)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description, agentId } = await req.json()

  if (!name || !agentId) {
    return NextResponse.json({ error: 'Name and Agent ID are required' }, { status: 400 })
  }

  // Check agentId not already taken
  const existing = await prisma.printer.findUnique({ where: { agentId } })
  if (existing) {
    return NextResponse.json({ error: 'Agent ID already in use' }, { status: 409 })
  }

  const printer = await prisma.printer.create({
    data: {
      name,
      description,
      agentId,
      userId: session.user.id,
      status: 'OFFLINE',
    },
  })

  return NextResponse.json(printer, { status: 201 })
}
