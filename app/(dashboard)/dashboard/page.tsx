import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import FileUpload from '@/components/FileUpload'
import RecentJobs from '@/components/RecentJobs'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — CloudPrint' }

export default async function DashboardPage() {
  const session = await auth()

  const userId = session!.user!.id as string

  const [printers, recentJobs, stats] = await Promise.all([
    prisma.printer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.printJob.findMany({
      where: { userId },
      include: { printer: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.printJob.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
    }),
  ])

  const totalJobs = stats.reduce((a, s) => a + s._count, 0)
  const completedJobs = stats.find((s) => s.status === 'COMPLETED')?._count ?? 0
  const failedJobs = stats.find((s) => s.status === 'FAILED')?._count ?? 0
  const onlinePrinters = printers.filter((p) => p.status === 'ONLINE').length
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Welcome back, <span className="text-zinc-300">{firstName}</span> 👋
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: 'Total jobs',
            value: totalJobs,
            icon: '📋',
            sub: 'all time',
            color: 'from-blue-500/10',
          },
          {
            label: 'Completed',
            value: completedJobs,
            icon: '✅',
            sub: `${totalJobs ? Math.round((completedJobs / totalJobs) * 100) : 0}% success rate`,
            color: 'from-green-500/10',
          },
          {
            label: 'Failed',
            value: failedJobs,
            icon: '❌',
            sub: failedJobs === 0 ? 'Perfect record!' : 'check error logs',
            color: 'from-red-500/10',
          },
          {
            label: 'Printers online',
            value: `${onlinePrinters}/${printers.length}`,
            icon: '🖨️',
            sub: onlinePrinters > 0 ? 'ready to print' : 'start the agent',
            color: 'from-purple-500/10',
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-5 bg-gradient-to-br ${s.color} to-transparent hover:border-zinc-700 transition-colors`}
          >
            <div className="text-xl mb-2">{s.icon}</div>
            <div className="text-3xl font-bold text-white">{s.value}</div>
            <div className="text-zinc-400 text-sm mt-0.5 font-medium">{s.label}</div>
            <div className="text-zinc-600 text-xs mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* New print job */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">New print job</h2>
        </div>
        {printers.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">🖨️</div>
            <div className="text-zinc-300 font-medium">No printers connected</div>
            <div className="text-zinc-500 text-sm mt-1">
              Set up the print agent on your PC first.{' '}
              <a href="/printers" className="text-blue-400 hover:text-blue-300 transition-colors">
                Add a printer →
              </a>
            </div>
          </div>
        ) : (
          <FileUpload printers={printers} />
        )}
      </div>

      {/* Recent jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent jobs</h2>
          <a href="/jobs" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            View all →
          </a>
        </div>
        <RecentJobs jobs={recentJobs} />
      </div>
    </div>
  )
}
