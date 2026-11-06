// The call card as a PNG, drawn from URL params (lib/og.ts): 1200×630, the size link previews
// use on X, Telegram and WhatsApp. Header on top, the call in the middle (pair left, SuperFactor
// right), the three levels along the bottom; every row shares the same edges.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { price } from '@/lib/format'

export const runtime = 'nodejs'

const W = 1200
const H = 630
/** Outer margins: every row starts and ends on these. */
const X = 64
const Y = 52

// The app's dark palette (apps/web/app/globals.css).
const C = {
  night: '#04090e',
  surface: '#0b131b',
  edge: '#16222d',
  ink: '#eff1f4',
  muted: '#8799a8',
  faint: '#53626f',
  good: '#3ecf8e',
  bad: '#ff4566',
  entry: '#4baefb',
  steel: '#6e9fcb',
}

type Font = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600
  style: 'normal' | 'italic'
}

/** One Google font file (TTF). */
async function googleFont(
  family: string,
  axis: string,
  weight: Font['weight'],
  style: Font['style'],
) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:${axis}`, {
    signal: AbortSignal.timeout(4000),
  }).then((r) => r.text())
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1]
  if (!url) throw new Error(`no ttf for ${family}`)
  const data = await fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer())
  return { name: family.replace('+', ' '), data, weight, style } satisfies Font
}

// Inter as the app uses it, and its italic for "Super". Fetched once per process; the
// renderer's default font if Google is unreachable.
let fonts: Promise<Font[]> | null = null
const loadFonts = () =>
  (fonts ??= Promise.all([
    googleFont('Inter', 'wght@400', 400, 'normal'),
    googleFont('Inter', 'wght@500', 500, 'normal'),
    googleFont('Inter', 'wght@600', 600, 'normal'),
    googleFont('Inter', 'ital,wght@1,600', 600, 'italic'),
  ]).catch(() => {
    fonts = null
    return []
  }))

let logo: Promise<string | null> | null = null
const loadLogo = () =>
  (logo ??= readFile(path.join(process.cwd(), 'public/brand/logo.svg'))
    .then((b) => `data:image/svg+xml;base64,${b.toString('base64')}`)
    .catch(() => null))

/** A remote image inlined as a data URL, only if it's a format the renderer can draw. */
async function inlineImage(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    const type = res.headers.get('content-type')?.split(';')[0] ?? ''
    if (!res.ok || !['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'].includes(type)) {
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 512_000) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

const num = (v: string | null) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
const text = (v: string | null, max: number) => (v ?? '').slice(0, max)
const signedPct = (f: number) => `${f >= 0 ? '+' : '−'}${(Math.abs(f) * 100).toFixed(1)}%`

/** When the call was made, e.g. "Oct 21, 14:20 UTC". */
function calledAt(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const date = d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${date}, ${time} UTC`
}

/** The SuperFactor as a meter: 20 segments, filled to the score. */
function Meter({ score }: { score: number }) {
  const n = 20
  const filled = Math.round((n * score) / 100)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: n }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of segments
          key={i}
          style={{ width: 8, height: 14, background: i < filled ? C.steel : C.edge }}
        />
      ))}
    </div>
  )
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const asset = text(q.get('asset'), 16) || '—'
  const name = text(q.get('name'), 32)
  const long = q.get('dir') !== 'short'
  const entry = num(q.get('entry'))
  const stop = num(q.get('stop'))
  const target = num(q.get('target'))
  const caller = text(q.get('caller'), 24)
  const sf = Math.max(0, Math.min(100, Math.round(Number(q.get('sf')) || 50)))
  const supercall = q.get('supercall') === '1'
  const [fontList, logoUrl, coinUrl, avatarUrl] = await Promise.all([
    loadFonts(),
    loadLogo(),
    inlineImage(q.get('logo')),
    inlineImage(q.get('avatar')),
  ])
  const hasFonts = fontList.length > 0
  const side = long ? C.good : C.bad

  const move = (to: number | null) => (entry && to ? (to - entry) / entry : null)
  // Same order as the composer: long reads target, entry, stop; short is reversed.
  const levels = [
    { key: 'Target', value: target, color: C.good, change: move(target) },
    { key: 'Entry', value: entry, color: C.entry, change: null },
    { key: 'Stop', value: stop, color: C.bad, change: move(stop) },
  ]
  if (!long) levels.reverse()

  // Long symbols step down so the pair never runs into the SuperFactor.
  const pairSize = asset.length > 7 ? 84 : asset.length > 5 ? 100 : 116

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: `${Y}px ${X}px`,
        background: `radial-gradient(900px 480px at 100% 0%, rgba(36,73,107,0.55) 0%, ${C.night} 70%)`,
        color: C.ink,
        fontFamily: hasFonts ? 'Inter' : undefined,
      }}
    >
      {/* Header: brand left, caller right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 48,
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} height={46} width={Math.round((46 * 124.4) / 32)} alt="" />
        ) : (
          <div style={{ fontSize: 30, fontWeight: 600 }}>Supercall</div>
        )}
        {caller && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {supercall && (
              <span
                style={{
                  display: 'flex',
                  padding: '6px 12px',
                  background: '#1b55c9',
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontStyle: 'italic' }}>Super</span>call
              </span>
            )}
            {avatarUrl && (
              <img src={avatarUrl} width={44} height={44} style={{ borderRadius: 22 }} alt="" />
            )}
            <span style={{ fontSize: 26, fontWeight: 500 }}>{`@${caller}`}</span>
          </div>
        )}
      </div>

      {/* The call: pair left, SuperFactor right, bottoms aligned */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 40,
                padding: '0 16px 0 12px',
                background: side,
                color: long ? C.night : '#ffffff',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 1.5,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d={long ? 'M6 18L18 6M18 6H9M18 6V15' : 'M6 6L18 18M18 18H9M18 18V9'}
                  stroke={long ? C.night : '#ffffff'}
                  strokeWidth="3"
                  strokeLinecap="square"
                />
              </svg>
              {long ? 'LONG' : 'SHORT'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 22 }}>
              {name && <span style={{ color: C.ink }}>{name}</span>}
              {name && <span style={{ color: C.faint }}>·</span>}
              <span style={{ color: C.muted }}>{calledAt(q.get('at') ?? '')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 22 }}>
            {coinUrl ? (
              <img src={coinUrl} width={84} height={84} style={{ borderRadius: 42 }} alt="" />
            ) : (
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  background: '#1c3550',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 38,
                  fontWeight: 600,
                }}
              >
                {asset.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span
                style={{
                  fontSize: pairSize,
                  fontWeight: 600,
                  letterSpacing: -pairSize / 28,
                  lineHeight: 1,
                }}
              >
                {asset}
              </span>
              <span style={{ fontSize: pairSize * 0.42, color: C.faint, marginLeft: 8 }}>
                /USDC
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 116, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>
            {String(sf)}
          </span>
          <span style={{ display: 'flex', fontSize: 28, marginTop: 10 }}>
            <span style={{ fontWeight: 600, fontStyle: 'italic', color: C.ink }}>Super</span>
            <span style={{ color: C.muted }}>Factor</span>
          </span>
          <div style={{ display: 'flex', marginTop: 16 }}>
            <Meter score={sf} />
          </div>
        </div>
      </div>

      {/* Levels, edge to edge */}
      <div style={{ display: 'flex', gap: 20 }}>
        {levels.map((l) => (
          <div
            key={l.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '20px 24px 22px',
              background: C.surface,
              border: `1px solid ${C.edge}`,
              borderTop: `3px solid ${l.color}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 20, fontWeight: 500, color: l.color }}>{l.key}</span>
              <span
                style={{
                  fontSize: 20,
                  color: l.change === null ? 'transparent' : l.color,
                }}
              >
                {l.change === null ? '0' : signedPct(l.change)}
              </span>
            </div>
            <span
              style={{
                fontSize: 52,
                fontWeight: 600,
                letterSpacing: -1.5,
                marginTop: 12,
                lineHeight: 1,
              }}
            >
              {l.value ? price(l.value) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>,
    {
      width: W,
      height: H,
      fonts: hasFonts ? fontList : undefined,
      headers: { 'cache-control': 'public, max-age=300, s-maxage=86400' },
    },
  )
}
