'use client'
import { useState, useEffect, useCallback } from 'react'
import JobCard from '@/components/JobCard'
import type { PrintJob, Printer } from '@prisma/client'

type JobWithPrinter = PrintJob & { printer: Printer }
type StatusFilter = 'ALL' | 'QUEUED' | 'PROCESSING' | 'PRINTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL',        label: 'All' },
  { value: 'QUEUED',     label: 'Queued' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'PRINTING',   label: 'Printing' },
  { value: 'COMPLETED',  label: 'Completed' },
  { value: 'FAILED',     label: 'Failed' },
  { value: 'CANCELLED',  label: 'Cancelled' },
]

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobWithPrinter[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (status !== 'ALL') params.set('status', status)
      const res = await fetch(`/api/jobs?${params}`)
      const data = await res.json()
      setJobs(data.jobs)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  async function handleBulkDelete(scope: 'all' | 'completed') {
    const confirmMessage = scope === 'completed'
      ? 'Delete all completed, failed, and cancelled print jobs? This will permanently delete their documents from storage to save space.'
      : 'Cancel all active print jobs and delete ALL print jobs from the queue permanently?'

    if (!confirm(confirmMessage)) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/jobs?scope=${scope}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to clear jobs')
      }
      setPage(1)
      await fetchJobs()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  function handleFilterChange(f: StatusFilter) {
    setStatus(f)
    setPage(1)
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Print Jobs</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} job{total !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {jobs.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkDelete('completed')}
                disabled={actionLoading}
                className="text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-xl transition-all duration-150 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clears finished/failed jobs and deletes their files."
              >
                Clear History
              </button>
              <button
                onClick={() => handleBulkDelete('all')}
                disabled={actionLoading}
                className="text-sm text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 px-4 py-2 rounded-xl transition-all duration-150 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cancels and deletes all print jobs."
              >
                Clear All Queue
              </button>
            </div>
          )}
          <button
            onClick={fetchJobs}
            disabled={actionLoading}
            className="text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23,4 23,10 17,10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ${
              status === f.value
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-zinc-400 font-medium">No jobs found</div>
          <div className="text-zinc-600 text-sm mt-1">
            {status !== 'ALL' ? `No ${status.toLowerCase()} jobs` : 'Upload a file to create your first job'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl text-sm bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-4 py-2 rounded-xl text-sm bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
