import type { ReactNode } from 'react'
import { Sidebar } from '@/components/sidebar'
import { TopBar } from '@/components/top-bar'
import { me } from '@/lib/data'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar balance={me.balance} />
        <main className="w-full max-w-[1200px] px-6 pt-7 pb-12">{children}</main>
      </div>
    </div>
  )
}
