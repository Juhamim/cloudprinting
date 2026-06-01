import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import JobStatusBadge from '@/components/JobStatusBadge'
import JobActions from '@/components/JobActions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Job Detail — CloudPrint' }

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const userId = session!.user!.id as string

  const job = await prisma.printJob.findFirst({
    where: { id, userId },
    include: { printer: true },
  })
  if (!job) notFound()

  const timeline = [
    { label: 'Queued',     time: job.createdAt,   done: true },
    { label: 'Processing', time: job.startedAt,    done: !!job.startedAt },
    { label: 'Printing',   time: job.startedAt,    done: ['PRINTING','COMPLETED'].includes(job.status) },
    { label: 'Completed',  time: job.completedAt,  done: job.status === 'COMPLETED' },
  ]

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {/* Back */}
      <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15,18 9,12 15,6"/>
        </svg>
        Back to jobs
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white break-all">{job.title}</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {new Date(job.createdAt).toLocaleString()} · {formatBytes(job.fileSize)}
          </p>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      {/* Error alert */}
      {job.errorMsg && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-red-400 text-sm">
          <div className="font-medium mb-1">⚠️ Print failed</div>
          <div className="text-red-300/80">{job.errorMsg}</div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Timeline</h2>
        <div className="space-y-0">
          {timeline.map((step, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  step.done ? 'border-blue-500 bg-blue-500' : 'border-zinc-700 bg-zinc-900'
                }`}>
                  {step.done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  )}
                </div>
                {i < timeline.length - 1 && (
                  <div className={`w-0.5 h-6 mt-0.5 ${step.done ? 'bg-blue-500/40' : 'bg-zinc-800'}`} />
                )}
              </div>
              <div className="pb-4">
                <div className={`text-sm font-medium ${step.done ? 'text-white' : 'text-zinc-600'}`}>
                  {step.label}
                </div>
                {step.time && (
                  <div className="text-xs text-zinc-600 mt-0.5">
                    {new Date(step.time).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Details grid */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Print options</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Printer', value: job.printer.name },
            { label: 'File type', value: job.fileType.split('/').pop()?.toUpperCase() },
            { label: 'Copies', value: job.copies },
            { label: 'Paper size', value: job.paperSize },
            { label: 'Color mode', value: job.colorMode === 'COLOR' ? 'Color' : 'Black & White' },
            { label: 'Orientation', value: job.orientation },
            { label: 'Priority', value: job.priority },
            { label: 'File size', value: formatBytes(job.fileSize) },
          ].map((d) => (
            <div key={d.label} className="bg-zinc-800/60 rounded-xl px-3 py-2.5">
              <dt className="text-xs text-zinc-500 mb-0.5">{d.label}</dt>
              <dd className="text-white font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* File link */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider">File</h2>
        {job.fileUrl ? (
          <a
            href={job.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15,3 21,3 21,9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View file
          </a>
        ) : (
          <div className="text-zinc-500 text-sm flex items-center gap-2">
            <span className="text-base">🗑️</span>
            <span>File cleared from storage (space saved)</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <JobActions jobId={job.id} hasFile={!!job.fileUrl} status={job.status} />
    </div>
  )
}
