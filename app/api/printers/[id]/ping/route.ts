import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const printer = await prisma.printer.findFirst({
    where: { id, userId: session.user.id }
  })

  if (!printer) {
    return NextResponse.json({ error: 'Printer not found' }, { status: 404 })
  }

  const baseAgentId = printer.agentId.split(':')[0]
  const agents = (global as any).__cloudprint_agents
  const ws = agents?.get(baseAgentId)

  if (!ws || ws.readyState !== 1) { // WebSocket.OPEN is 1
    return NextResponse.json({ error: 'Agent is offline (WebSocket not connected)' }, { status: 503 })
  }

  try {
    ws.send(JSON.stringify({
      type: 'PING_PRINTER',
      agentId: printer.agentId,
      printerId: printer.id
    }))
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to dispatch ping: ${err.message}` }, { status: 500 })
  }
}
