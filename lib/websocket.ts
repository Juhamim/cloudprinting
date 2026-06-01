// WebSocket connection manager — tracks connected print agents
// This runs server-side and holds an in-memory Map of agent WebSocket connections.
// Note: In production on Vercel (serverless), this won't persist across instances.
// For persistent connections, use a dedicated WebSocket server (see server.js).

import type { WebSocket } from 'ws'

type AgentSocket = WebSocket & { readyState: number }

const agents = new Map<string, AgentSocket>()

export function registerAgent(agentId: string, ws: AgentSocket) {
  agents.set(agentId, ws)
  console.log(`[WS] Agent registered: ${agentId} (total: ${agents.size})`)
}

export function removeAgent(agentId: string) {
  agents.delete(agentId)
  console.log(`[WS] Agent removed: ${agentId} (total: ${agents.size})`)
}

export function getAgent(agentId: string): AgentSocket | undefined {
  return agents.get(agentId)
}

export function isAgentOnline(agentId: string): boolean {
  const ws = agents.get(agentId)
  return ws !== undefined && ws.readyState === 1 // WebSocket.OPEN = 1
}

export function sendToAgent(agentId: string, message: object): boolean {
  const ws = agents.get(agentId)
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message))
    return true
  }
  return false
}

export function getConnectedAgents(): string[] {
  return Array.from(agents.keys())
}
