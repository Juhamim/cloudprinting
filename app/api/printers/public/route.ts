import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const printers = await prisma.printer.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        description: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(printers)
  } catch (err) {
    console.error('[printers-public]', err)
    return NextResponse.json({ error: 'Failed to fetch printers' }, { status: 500 })
  }
}
