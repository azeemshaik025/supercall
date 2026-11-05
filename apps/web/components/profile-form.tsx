'use client'

import Link from 'next/link'
import { useState } from 'react'
import { me } from '@/lib/data'
import { PageTitle } from './ui'

function Row({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-line px-5 py-[18px] last:border-0">
      {icon}
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-[14px] font-medium">{title}</span>
        <span className="text-[12px] text-muted">{sub}</span>
      </span>
      {right}
    </div>
  )
}

const ok = (t: string) => <span className="bg-good-soft px-2 py-0.5 text-[12px] text-good">{t}</span>
const tile = (c: React.ReactNode) => <span className="grid size-9 shrink-0 place-items-center border border-line-strong bg-surface-2">{c}</span>

export function ProfileForm() {
  const [username, setUsername] = useState(me.handle)
  const [name, setName] = useState('Rakesh')
  const [saved, setSaved] = useState(false)
  return (
    <div className="max-w-[760px] space-y-5">
      <PageTitle title="Profile" sub="How followers know you. Your calls and SuperFactor stay on your record." />
      <section className="surface-card flex flex-col gap-4 p-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Username</span>
            <span className="flex h-[42px] items-center border border-line-strong bg-sidebar px-3">
              <span className="text-faint">@</span>
              <input value={username} onChange={(e) => { setUsername(e.target.value); setSaved(false) }} className="min-w-0 flex-1 bg-transparent pl-0.5 text-[14px] outline-none" />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Display name (optional)</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} className="h-[42px] border border-line-strong bg-sidebar px-3 text-[14px] outline-none" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSaved(true)} className="btn-cta h-[38px] cursor-pointer px-4 text-[13px]">Save</button>
          {saved && <span className="text-[13px] text-good">Saved</span>}
          <Link href={`/u/${me.handle}`} className="ml-auto text-[13px] text-steel hover:text-ink">View public page</Link>
        </div>
      </section>
      <section aria-label="Connections" className="surface-card">
        <Row
          icon={tile(<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" /></svg>)}
          title="X account"
          sub={`Your posts on X are read as calls. Linked as @${me.xHandle}`}
          right={ok('Linked')}
        />
        <Row icon={<img src="/brand/verified.svg" alt="" className="size-9" />} title="World ID" sub="Proves you're one human, so a bad run can't be escaped with a new account. Needed to publish." right={ok('Verified')} />
        <Row
          icon={tile(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" /><path d="M3 7l9 6 9-6" /></svg>)}
          title="Email"
          sub="For notices when a call you copied ends."
          right={<button type="button" className="h-8 cursor-pointer border border-line-strong bg-sidebar px-3 text-[12px]">Add email</button>}
        />
        <Row
          icon={<img src="/wallets/metamask.svg" alt="" className="size-9" />}
          title="Publishing wallet"
          sub={<>Your own trades on a call come from here, so followers can check them. <span className="font-mono text-silver">{me.address}</span></>}
          right={<button type="button" className="h-8 cursor-pointer border border-line-strong bg-sidebar px-3 text-[12px]">Change</button>}
        />
      </section>
      <section className="flex flex-wrap items-center gap-4 border border-line-strong p-5 text-white" style={{ background: 'var(--sc-brand)' }}>
        <span className="flex flex-[1_1_280px] flex-col gap-1">
          <span className="text-[16px] font-medium">Caller record is live</span>
          <span className="text-[13px] text-white/90">Signed once. Your posts on X are read as calls from now on.</span>
        </span>
        <Link href="/compose" className="flex h-[38px] items-center bg-ink px-3.5 text-[13px] font-medium text-bg">Publish a call</Link>
      </section>
    </div>
  )
}
