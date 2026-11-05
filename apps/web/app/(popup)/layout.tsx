import type { ReactNode } from 'react'

/** The extension’s Copy button opens these in a wallet-sized window. */
export default function PopupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-3 p-4">
      {children}
    </div>
  )
}
