import type { ReactNode } from 'react'
import { Sidebar } from '@/components/sidebar'
import { TopBar } from '@/components/top-bar'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // The window never scrolls: the sidebar and top bar stay put and only the page scrolls, so
    // the sidebar can float over the page without anything sliding under or over it.
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6 pt-7 pb-12">{children}</div>
        </main>
      </div>
    </div>
  )
}
