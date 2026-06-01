'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Printer } from '@prisma/client'
import PrinterCard from '@/components/PrinterCard'

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', agentId: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fetchPrinters = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/printers')
      setPrinters(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPrinters() }, [fetchPrinters])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to add printer')
      setSubmitting(false)
      return
    }
    setPrinters((prev) => [data, ...prev])
    setShowModal(false)
    setForm({ name: '', description: '', agentId: '' })
    setSubmitting(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this printer? All associated jobs will remain.')) return
    await fetch(`/api/printers/${id}`, { method: 'DELETE' })
    setPrinters((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Printers</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Connect a printer by running the agent on your PC
          </p>
        </div>
        <button
          id="add-printer-btn"
          onClick={() => setShowModal(true)}
          className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add printer
        </button>
      </div>

      {/* Printer grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : printers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">🖨️</div>
          <div className="text-zinc-300 font-semibold text-lg">No printers added yet</div>
          <div className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
            Install the CloudPrint agent on the PC connected to your USB printer, then click <strong className="text-zinc-400">Add printer</strong> to register it here.
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
          >
            Add your first printer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {printers.map((p) => (
            <PrinterCard key={p.id} printer={p} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Agent setup instructions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-base">📋</span> Agent setup instructions
        </h2>
        <ol className="space-y-3 text-sm text-zinc-400">
          {[
            <>Copy the <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">agent/</code> folder to the PC connected to your USB printer</>,
            <><code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">npm install</code> inside the agent folder</>,
            <>Edit <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">agent.js</code> — set your <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">AGENT_ID</code>, <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">WS_URL</code>, and <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">WS_SECRET</code></>,
            <>Run <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">node agent.js</code></>,
            <>Come back here and click <strong className="text-zinc-300">Add printer</strong> — use the same <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">AGENT_ID</code></>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 text-xs flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Add printer modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Add printer</h2>
              <button
                onClick={() => { setShowModal(false); setError('') }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Printer name <span className="text-red-400">*</span></label>
                <input
                  id="printer-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g. Home Office HP"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Description</label>
                <input
                  id="printer-desc"
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. USB laser printer in the study"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Agent ID <span className="text-red-400">*</span></label>
                <input
                  id="printer-agent-id"
                  type="text"
                  value={form.agentId}
                  onChange={(e) => setForm({ ...form, agentId: e.target.value.trim() })}
                  required
                  placeholder="e.g. home-office-printer"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
                <p className="text-xs text-zinc-600 mt-1.5">Must match the AGENT_ID in your agent.js config</p>
              </div>

              {error && (
                <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError('') }}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="printer-submit"
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
                >
                  {submitting ? 'Adding…' : 'Add printer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
