import type { PrintJob, Printer } from '@prisma/client'
import Link from 'next/link'
import JobStatusBadge from './JobStatusBadge'

type JobWithPrinter = PrintJob & { printer: Printer }

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/webp': '🖼️',
  'text/plain': '📃',
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function JobCard({ job }: { job: JobWithPrinter }) {
  const icon = FILE_ICONS[job.fileType] || '📄'

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all duration-150 group"
    >
      {/* File icon */}
      <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center text-xl shrink-0 transition-colors">
        {icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{job.title}</div>
        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-zinc-500">
          <span>{job.printer?.name}</span>
          <span className="text-zinc-700">·</span>
          <span>{job.copies} cop{job.copies === 1 ? 'y' : 'ies'}</span>
          <span className="text-zinc-700">·</span>
          <span>{job.paperSize}</span>
          <span className="text-zinc-700">·</span>
          <span>{job.colorMode === 'COLOR' ? 'Color' : 'B&W'}</span>
          <span className="text-zinc-700">·</span>
          <span>{formatBytes(job.fileSize)}</span>
          <span className="text-zinc-700">·</span>
          <span>{formatDate(job.createdAt)}</span>
        </div>
        {job.errorMsg && (
          <div className="mt-1 text-xs text-red-400 bg-red-400/10 rounded px-2 py-0.5 inline-block">
            {job.errorMsg}
          </div>
        )}
      </div>

      {/* Status + priority */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <JobStatusBadge status={job.status} />
        {job.priority !== 'NORMAL' && (
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            job.priority === 'URGENT' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
            job.priority === 'HIGH'   ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' :
            'text-zinc-500 bg-zinc-500/10 border-zinc-500/20'
          }`}>
            {job.priority}
          </span>
        )}
      </div>
    </Link>
  )
}
