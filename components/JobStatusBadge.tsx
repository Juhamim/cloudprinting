import type { JobStatus } from '@prisma/client'

const STATUS_CONFIG: Record<JobStatus, { label: string; className: string; dot: string }> = {
  QUEUED:     { label: 'Queued',     className: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',  dot: 'bg-yellow-400' },
  PROCESSING: { label: 'Processing', className: 'text-blue-400 bg-blue-400/10 border-blue-400/20',         dot: 'bg-blue-400 animate-pulse' },
  PRINTING:   { label: 'Printing',   className: 'text-blue-300 bg-blue-300/10 border-blue-300/20',         dot: 'bg-blue-300 animate-pulse' },
  COMPLETED:  { label: 'Completed',  className: 'text-green-400 bg-green-400/10 border-green-400/20',      dot: 'bg-green-400' },
  FAILED:     { label: 'Failed',     className: 'text-red-400 bg-red-400/10 border-red-400/20',            dot: 'bg-red-400' },
  CANCELLED:  { label: 'Cancelled',  className: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',         dot: 'bg-zinc-400' },
}

export default function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.QUEUED
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  )
}
