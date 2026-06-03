import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const secret = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    const wsSecret = process.env.WS_SECRET

    if (!secret || !wsSecret || secret !== wsSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { agentId, printers } = await req.json()
    if (!agentId || !Array.isArray(printers)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Get the first admin/owner user in the system to associate new printers with
    const user = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    }) || await prisma.user.findFirst()

    if (!user) {
      return NextResponse.json({ error: 'No admin or user found in database to associate printers with' }, { status: 500 })
    }

    const userId = user.id
    const syncedAgentIds: string[] = []

    for (const p of printers) {
      const printerAgentId = `${agentId}:${p.name}`
      syncedAgentIds.push(printerAgentId)

      await prisma.printer.upsert({
        where: { agentId: printerAgentId },
        update: {
          status: 'ONLINE',
          lastSeen: new Date(),
          name: p.name,
        },
        create: {
          name: p.name,
          agentId: printerAgentId,
          userId,
          status: 'ONLINE',
          lastSeen: new Date(),
          description: `Auto-discovered USB printer on ${agentId}`,
        }
      })
    }

    // Mark other printers of this agent that are NOT in the sync list as OFFLINE
    await prisma.printer.updateMany({
      where: {
        userId,
        agentId: {
          startsWith: `${agentId}:`,
          notIn: syncedAgentIds,
        }
      },
      data: {
        status: 'OFFLINE'
      }
    })

    return NextResponse.json({ success: true, count: printers.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
