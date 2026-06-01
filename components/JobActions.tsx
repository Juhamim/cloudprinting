'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface JobActionsProps {
  jobId: string
  hasFile: boolean
  status: string
}

export default function JobActions({ jobId, hasFile, status }: JobActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isActive = ['QUEUED', 'PROCESSING', 'PRINTING'].includes(status)

  async function handleDelete(fileOnly = false) {
    const message = fileOnly
      ? 'Delete the uploaded document from storage? The job record will remain in your history but the file will be deleted to save space.'
      : isActive
      ? 'Cancel and delete this active print job?'
      : 'Delete this print job record and its document permanently?'

    if (!confirm(message)) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/jobs/${jobId}${fileOnly ? '?fileOnly=true' : ''}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to complete action')
      }

      if (fileOnly) {
        router.refresh()
      } else {
        router.push('/jobs')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Actions</h2>
        
        <div className="flex flex-wrap gap-3">
          {isActive ? (
            <button
              onClick={() => handleDelete(false)}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-2"
            >
              Cancel & Delete Job
            </button>
          ) : (
            <>
              {hasFile && (
                <button
                  onClick={() => handleDelete(true)}
                  disabled={loading}
                  className="bg-zinc-800 hover:bg-zinc-700 hover:text-white disabled:opacity-50 text-zinc-300 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 flex items-center gap-2"
                  title="Deletes the file from Cloudflare R2 to save space while keeping the job history record."
                >
                  Clear File (Save Storage)
                </button>
              )}
              
              <button
                onClick={() => handleDelete(false)}
                disabled={loading}
                className="bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 text-red-400 hover:text-white disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-2"
              >
                Delete Job Record
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
