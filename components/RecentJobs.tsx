import type { PrintJob, Printer } from '@prisma/client'
import JobCard from './JobCard'
import Link from 'next/link'

type JobWithPrinter = PrintJob & { printer: Printer }

export default function RecentJobs({ jobs }: { jobs: JobWithPrinter[] }) {
  if (jobs.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">🖨️</div>
        <div className="text-zinc-400 font-medium">No print jobs yet</div>
        <div className="text-zinc-600 text-sm mt-1">Upload a file above to create your first job</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
      {jobs.length >= 5 && (
        <div className="text-center pt-1">
          <Link href="/jobs" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            View all jobs →
          </Link>
        </div>
      )}
    </div>
  )
}
