'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'

interface DashboardLayoutClientProps {
  children: React.ReactNode
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export default function DashboardLayoutClient({ children, user }: DashboardLayoutClientProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden relative">
      {/* Sidebar for Desktop & Mobile Overlay Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar user={user} onClose={() => setIsOpen(false)} />
      </div>

      {/* Backdrop overlay for mobile screen when sidebar is open */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity duration-300"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Mobile Navbar (Header) */}
        <header className="h-16 border-b border-zinc-800/60 bg-zinc-900/50 backdrop-blur-md flex items-center justify-between px-6 md:hidden shrink-0">
          {/* Hamburger Menu Toggle Button */}
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 -ml-2 text-zinc-400 hover:text-white rounded-lg focus:outline-none hover:bg-zinc-800/40 active:scale-95 transition-all"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          
          {/* Logo (Centered for mobile visual balance) */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6,9 6,2 18,2 18,9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </div>
            <span className="text-md font-bold">
              Cloud<span className="text-blue-400">Print</span>
            </span>
          </div>

          {/* User initials/avatar */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold uppercase shrink-0">
            {user?.name?.[0] || user?.email?.[0] || '?'}
          </div>
        </header>

        {/* Scrollable Main Area for Dashboard Pages */}
        <main className="flex-1 overflow-y-auto bg-zinc-950">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
