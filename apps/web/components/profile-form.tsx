'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { useCallerSetup, usernameFromX } from '@/lib/caller'
import { useMe } from '@/lib/me'
import { PageTitle } from './ui'
import { VerifyWithWorld } from './world-id'

function Row({
  icon,
  title,
  sub,
  right,
}: {
  icon: React.ReactNode
  title: string
  sub: React.ReactNode
  right: React.ReactNode
}) {
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

const ok = (t: string) => (
  <span className="bg-good-soft px-2 py-0.5 text-[12px] text-good">{t}</span>
)
const action = (label: string, onClick: () => void) => (
  <button
    type="button"
    onClick={onClick}
    className="h-8 cursor-pointer border border-line-strong bg-sidebar px-3 text-[12px] hover:bg-surface-2"
  >
    {label}
  </button>
)
const tile = (c: React.ReactNode) => (
  <span className="grid size-9 shrink-0 place-items-center border border-line-strong bg-surface-2">
    {c}
  </span>
)

export function ProfileForm() {
  const { getAccessToken, linkTwitter, linkEmail } = usePrivy()
  const { me, error } = useMe()
  const caller = useCallerSetup()
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [saving, setSaving] = useState(false)
  // Filled from the account once it loads: the saved profile, else the X handle as a suggestion.
  const savedName = me?.profile?.username
  const savedDisplay = me?.profile?.displayName
  const xName = me?.account.x?.username
  const xDisplay = me?.account.x?.name
  // Only when what's saved or linked changes, so a re-read never wipes what's being typed.
  useEffect(() => {
    setUsername(savedName ?? usernameFromX(xName) ?? '')
    setName(savedDisplay ?? xDisplay ?? '')
  }, [savedName, savedDisplay, xName, xDisplay])
  const save = async () => {
    setSaving(true)
    setProblem(undefined)
    try {
      await api('/me', {
        method: 'PUT',
        token: await getAccessToken(),
        body: { username: username.toLowerCase(), displayName: name || undefined },
      })
      setSaved(true)
      await caller.reload()
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  if (me === undefined)
    return <p className="text-[13px] text-muted">{error ?? 'Loading your profile…'}</p>
  if (!me) return null
  const profile = me.profile
  const x = me.account.x
  const wallet = profile?.wallet ?? me.account.wallets[0]
  return (
    <div className="max-w-[760px] space-y-5">
      <PageTitle
        title="Profile"
        sub="How followers know you. Your calls and SuperFactor stay on your record."
      />
      <section className="surface-card flex flex-col gap-4 p-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Username</span>
            <span className="flex h-[42px] items-center border border-line-strong bg-sidebar px-3">
              <span className="text-faint">@</span>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setSaved(false)
                }}
                className="min-w-0 flex-1 bg-transparent pl-0.5 text-[14px] outline-none"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Display name (optional)</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              className="h-[42px] border border-line-strong bg-sidebar px-3 text-[14px] outline-none"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || username.length < 3}
            className="btn-cta h-[38px] cursor-pointer px-4 text-[13px] disabled:opacity-50"
          >
            {saving ? 'Saving…' : profile ? 'Save' : 'Create profile'}
          </button>
          {saved && !problem && <span className="text-[13px] text-good">Saved</span>}
          {problem && <span className="text-[13px] text-bad">{problem}</span>}
          {profile && (
            <Link
              href={`/u/${profile.username}`}
              className="ml-auto text-[13px] text-steel hover:text-ink"
            >
              View public page
            </Link>
          )}
        </div>
      </section>
      <section aria-label="Connections" className="surface-card">
        <Row
          icon={tile(
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
            </svg>,
          )}
          title="X account"
          sub={
            x
              ? `Your posts on X are read as calls once you’re a caller. Linked as @${x.username}`
              : 'Link X so your posts there can be read as calls.'
          }
          right={x ? ok('Linked') : action('Link X', () => linkTwitter())}
        />
        <Row
          icon={<img src="/brand/verified.svg" alt="" className="size-9" />}
          title="World ID"
          sub="Proves you’re one human, so a bad run can’t be escaped with a new account. Needed to publish."
          right={
            me.worldVerified ? (
              ok('Verified')
            ) : profile ? (
              <span className="w-56">
                <VerifyWithWorld wallet={profile.wallet} onVerified={() => void caller.reload()} />
              </span>
            ) : (
              <span className="text-[12px] text-muted">Create your profile first</span>
            )
          }
        />
        <Row
          icon={tile(
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" />
              <path d="M3 7l9 6 9-6" />
            </svg>,
          )}
          title="Email"
          sub={me.account.email ?? 'For notices when a call you copied ends.'}
          right={me.account.email ? ok('Linked') : action('Add email', () => linkEmail())}
        />
        <Row
          icon={tile(<span className="font-mono text-[11px] text-silver">0x</span>)}
          title="Publishing wallet"
          sub={
            <>
              Your own trades on a call come from here, so followers can check them.{' '}
              <span className="font-mono text-silver">{wallet ?? 'Not created yet'}</span>
            </>
          }
          right={null}
        />
        <Row
          icon={tile(<span className="font-mono text-[11px] text-silver">AR</span>)}
          title="Caller record"
          sub="Your record on Arkiv: nobody can edit it, us included. Your calls are scored against it."
          right={
            caller.step === 'done' ? (
              ok('On Arkiv')
            ) : caller.step === 'record' ? (
              action('Sign record', () => void caller.signRecord())
            ) : (
              <span className="text-[12px] text-muted">After World ID</span>
            )
          }
        />
      </section>
      <section
        className="flex flex-wrap items-center gap-4 border border-line-strong p-5 text-white"
        style={{ background: 'var(--sc-brand)' }}
      >
        <span className="flex flex-[1_1_280px] flex-col gap-1">
          <span className="text-[16px] font-medium">Caller record is live</span>
          <span className="text-[13px] text-white/90">
            Signed once. Your posts on X are read as calls from now on.
          </span>
        </span>
        <Link
          href="/compose"
          className="flex h-[38px] items-center bg-ink px-3.5 text-[13px] font-medium text-bg"
        >
          Publish a call
        </Link>
      </section>
    </div>
  )
}
