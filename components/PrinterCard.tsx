import type { Printer } from '@prisma/client'

const STATUS_CONFIG = {
  ONLINE:  { dot: 'bg-green-400',  label: 'Online',  labelClass: 'text-green-400' },
  OFFLINE: { dot: 'bg-zinc-600',   label: 'Offline', labelClass: 'text-zinc-500' },
  BUSY:    { dot: 'bg-yellow-400 animate-pulse', label: 'Busy', labelClass: 'text-yellow-400' },
  ERROR:   { dot: 'bg-red-400',    label: 'Error',   labelClass: 'text-red-400'  },
}

function timeAgo(date: Date | string | null) {
  if (!date) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function PrinterCard({
  printer,
  onDelete,
}: {
  printer: Printer
  onDelete?: (id: string) => void
}) {
  const cfg = STATUS_CONFIG[printer.status] ?? STATUS_CONFIG.OFFLINE

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors duration-150 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
              <polyline points="6,9 6,2 18,2 18,9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
          </div>
          <div>
            <div className="font-semibold text-white">{printer.name}</div>
            {printer.description && (
              <div className="text-xs text-zinc-500 mt-0.5">{printer.description}</div>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <span className={`text-xs font-medium ${cfg.labelClass}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 text-xs text-zinc-500 border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between">
          <span>Agent ID</span>
          <code className="text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono text-xs">
            {printer.agentId}
          </code>
        </div>
        <div className="flex items-center justify-between">
          <span>Last seen</span>
          <span className="text-zinc-400">{timeAgo(printer.lastSeen)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Added</span>
          <span className="text-zinc-400">
            {new Date(printer.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Actions */}
      {onDelete && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <button
            onClick={() => onDelete(printer.id)}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Remove printer
          </button>
        </div>
      )}
    </div>
  )
}
