import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 60%)' }}
        />
      </div>

      <div className="max-w-3xl text-center space-y-6 relative animate-slide-up">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-sm text-zinc-400">
          <span className="w-2 h-2 bg-green-400 rounded-full status-online" />
          Print from anywhere — instantly
        </div>

        {/* Hero heading */}
        <h1 className="text-7xl font-bold tracking-tight leading-none">
          Cloud<span className="gradient-text">Print</span>
        </h1>

        <p className="text-xl text-zinc-400 leading-relaxed max-w-xl mx-auto">
          Upload documents from any device. Print to your USB printer at home or
          office — in seconds, securely, from anywhere in the world.
        </p>

        {/* CTA buttons */}
        <div className="flex gap-4 justify-center pt-2">
          <Link
            href="/register"
            className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white px-8 py-3.5 rounded-xl font-semibold transition-all duration-150 shadow-lg shadow-blue-500/25"
          >
            Get started — it&apos;s free
          </Link>
          <Link
            href="/login"
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white px-8 py-3.5 rounded-xl font-semibold transition-all duration-150 border border-zinc-700"
          >
            Sign in
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-16 text-left">
          {[
            {
              icon: '📤',
              title: 'Upload anywhere',
              desc: 'PDF, Word, images — from phone, tablet, or laptop',
              color: 'from-blue-500/20 to-transparent',
            },
            {
              icon: '🖨️',
              title: 'Print instantly',
              desc: 'Jobs dispatch in seconds to your USB printer via WebSocket',
              color: 'from-purple-500/20 to-transparent',
            },
            {
              icon: '🔒',
              title: '100% private',
              desc: 'Files stored on your own Cloudflare R2 — nobody else can see them',
              color: 'from-emerald-500/20 to-transparent',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="glass rounded-2xl p-5 hover:border-zinc-600 transition-colors duration-200 group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4"
                style={{ background: `radial-gradient(circle at 30% 30%, ${f.color})`, backgroundColor: 'rgba(39,39,42,0.8)' }}
              >
                {f.icon}
              </div>
              <div className="font-semibold text-white mb-1">{f.title}</div>
              <div className="text-sm text-zinc-400 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="pt-12 border-t border-zinc-800/60">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-6 font-medium">How it works</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-zinc-500">
            {[
              'Upload a file',
              '→',
              'CloudPrint queues the job',
              '→',
              'Agent prints on your PC',
              '→',
              'Done ✓',
            ].map((s, i) => (
              <span
                key={i}
                className={s === '→' ? 'text-zinc-700' : 'bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400'}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
