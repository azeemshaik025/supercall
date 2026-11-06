import type { ReactNode } from 'react'
import { Sidebar } from '@/components/sidebar'
import { TopBar } from '@/components/top-bar'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar balance={0} />
        <main className="mx-auto w-full max-w-[1600px] px-6 pt-7 pb-12">{children}</main>
      </div>
    </div>
  )
}
