import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardLayoutClient from '@/components/DashboardLayoutClient'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <DashboardLayoutClient user={session?.user ?? {}}>
      {children}
    </DashboardLayoutClient>
  )
}
