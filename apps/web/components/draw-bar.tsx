'use client'

// Drawing tools beside the chart: lines, channels, fibs, shapes and notes. Drawings live in
// their own group, so magnet, lock, hide and delete never touch the call's levels.
import { type Chart, OverlayMode, registerOverlay } from 'klinecharts'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cx } from './ui'

const DRAWINGS = 'drawings'

type Point = { x: number; y: number }
let registered = false
/** Shapes klinecharts doesn't ship: rectangle, circle, triangle and arrow. */
function registerShapes() {
  if (registered) return
  registered = true
  const fill = { style: 'stroke_fill' }
  registerOverlay({
    name: 'rect',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const [a, b] = coordinates as Point[]
      if (!a || !b) return []
      return [
        {
          type: 'rect',
          attrs: {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
          },
          styles: fill,
        },
      ]
    },
  })
  registerOverlay({
    name: 'circle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const [a, b] = coordinates as Point[]
      if (!a || !b) return []
      return [
        { type: 'circle', attrs: { ...a, r: Math.hypot(b.x - a.x, b.y - a.y) }, styles: fill },
      ]
    },
  })
  registerOverlay({
    name: 'triangle',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => [
      { type: coordinates.length < 3 ? 'line' : 'polygon', attrs: { coordinates }, styles: fill },
    ],
  })
  registerOverlay({
    name: 'arrow',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const [a, b] = coordinates as Point[]
      if (!a || !b) return []
      const t = Math.atan2(b.y - a.y, b.x - a.x)
      const head = (d: number) => ({ x: b.x - 10 * Math.cos(t + d), y: b.y - 10 * Math.sin(t + d) })
      return [
        { type: 'line', attrs: { coordinates: [a, b] } },
        { type: 'line', attrs: { coordinates: [head(0.45), b, head(-0.45)] } },
      ]
    },
  })
}

/** 16px stroke icons drawn on a 24 grid. */
const I = ({ children }: { children: ReactNode }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)
const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="1.8" />

type Tool = { name: string; label: string; icon: ReactNode }

const MAIN: Tool[] = [
  {
    name: 'segment',
    label: 'Trend line',
    icon: (
      <I>
        <path d="M6.3 17.7 17.7 6.3" />
        {dot(5, 19)}
        {dot(19, 5)}
      </I>
    ),
  },
  {
    name: 'rayLine',
    label: 'Ray',
    icon: (
      <I>
        <path d="M6.3 17.7 21 3" />
        {dot(5, 19)}
      </I>
    ),
  },
  {
    name: 'horizontalStraightLine',
    label: 'Horizontal line',
    icon: (
      <I>
        <path d="M2 12h20" />
      </I>
    ),
  },
  {
    name: 'priceLine',
    label: 'Price line',
    icon: (
      <I>
        <path d="M3 12h11" />
        <rect x="14" y="9" width="7" height="6" />
      </I>
    ),
  },
  {
    name: 'parallelStraightLine',
    label: 'Parallel channel',
    icon: (
      <I>
        <path d="M2 15 15 2M9 22 22 9" />
      </I>
    ),
  },
  {
    name: 'fibonacciLine',
    label: 'Fib retracement',
    icon: (
      <I>
        <path d="M3 4h18M3 9h18M3 13h18M3 16h18M3 20h18" />
      </I>
    ),
  },
  {
    name: 'rect',
    label: 'Rectangle',
    icon: (
      <I>
        <rect x="4" y="6" width="16" height="12" />
      </I>
    ),
  },
  {
    name: 'simpleAnnotation',
    label: 'Note',
    icon: (
      <I>
        <path d="M5 5h14M12 5v14" />
      </I>
    ),
  },
]

const MORE: Tool[] = [
  {
    name: 'straightLine',
    label: 'Extended line',
    icon: (
      <I>
        <path d="M2 22 22 2" />
      </I>
    ),
  },
  {
    name: 'horizontalRayLine',
    label: 'Horizontal ray',
    icon: (
      <I>
        <path d="M6.8 12H22" />
        {dot(5, 12)}
      </I>
    ),
  },
  {
    name: 'horizontalSegment',
    label: 'Horizontal segment',
    icon: (
      <I>
        <path d="M6.8 12h10.4" />
        {dot(5, 12)}
        {dot(19, 12)}
      </I>
    ),
  },
  {
    name: 'verticalStraightLine',
    label: 'Vertical line',
    icon: (
      <I>
        <path d="M12 2v20" />
      </I>
    ),
  },
  {
    name: 'verticalRayLine',
    label: 'Vertical ray',
    icon: (
      <I>
        <path d="M12 17.2V2" />
        {dot(12, 19)}
      </I>
    ),
  },
  {
    name: 'verticalSegment',
    label: 'Vertical segment',
    icon: (
      <I>
        <path d="M12 6.8v10.4" />
        {dot(12, 5)}
        {dot(12, 19)}
      </I>
    ),
  },
  {
    name: 'priceChannelLine',
    label: 'Price channel',
    icon: (
      <I>
        <path d="M2 17 12 7M8 21 22 7" />
        <path d="M5 20 18 7" strokeDasharray="2 2" />
      </I>
    ),
  },
  {
    name: 'arrow',
    label: 'Arrow',
    icon: (
      <I>
        <path d="M5 19 19 5M10 5h9v9" />
      </I>
    ),
  },
  {
    name: 'circle',
    label: 'Circle',
    icon: (
      <I>
        <circle cx="12" cy="12" r="8" />
      </I>
    ),
  },
  {
    name: 'triangle',
    label: 'Triangle',
    icon: (
      <I>
        <path d="M12 4 21 20H3z" />
      </I>
    ),
  },
  {
    name: 'simpleTag',
    label: 'Price tag',
    icon: (
      <I>
        <path d="M3 12 8 6h13v12H8z" />
        {dot(10, 12)}
      </I>
    ),
  },
]

const ICON = {
  cursor: (
    <I>
      <path d="M5 3 19 12l-6.5 1.5L9.5 20z" />
    </I>
  ),
  magnet: (
    <I>
      <path d="M6 3v9a6 6 0 0 0 12 0V3M6 8h4M14 8h4" />
    </I>
  ),
  lock: (
    <I>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </I>
  ),
  unlock: (
    <I>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </I>
  ),
  eye: (
    <I>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </I>
  ),
  eyeOff: (
    <I>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <path d="M3 3l18 18" />
    </I>
  ),
  trash: (
    <I>
      <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15" />
    </I>
  ),
}

/**
 * Every drawing tool in one column: everyday ones on top, the rest scrolling, and magnet,
 * lock, hide and delete pinned at the bottom. Esc or the cursor drops a half-drawn shape.
 */
export function DrawBar({ chart }: { chart: Chart | null }) {
  const [active, setActive] = useState<string | null>(null)
  const [magnet, setMagnet] = useState(false)
  const [locked, setLocked] = useState(false)
  const [hidden, setHidden] = useState(false)
  const pending = useRef<string | null>(null)

  useEffect(registerShapes, [])

  const cancel = useCallback(() => {
    if (pending.current) chart?.removeOverlay({ id: pending.current })
    pending.current = null
    setActive(null)
  }, [chart])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  const start = (name: string) => {
    if (!chart) return
    if (active === name) return cancel()
    cancel()
    setActive(name)
    const color =
      getComputedStyle(document.documentElement).getPropertyValue('--sc-entry').trim() || '#4d8dff'
    const id = chart.createOverlay({
      name,
      groupId: DRAWINGS,
      lock: locked,
      visible: !hidden,
      mode: magnet ? OverlayMode.WeakMagnet : OverlayMode.Normal,
      styles: {
        line: { color },
        point: { color, borderColor: color, activeColor: color, activeBorderColor: color },
        polygon: { color: `${color}22`, borderColor: color },
        rect: { color: `${color}22`, borderColor: color },
        circle: { color: `${color}22`, borderColor: color },
        text: { color: '#ffffff', backgroundColor: color, borderColor: color },
      },
      onDrawEnd: () => {
        pending.current = null
        setActive(null)
        return false
      },
    })
    pending.current = typeof id === 'string' ? id : null
  }

  return (
    <div className="flex w-11 shrink-0 flex-col items-center border-r border-line py-1.5">
      <ToolButton
        label="Cursor · drag and pan (Esc)"
        icon={ICON.cursor}
        on={active === null}
        onClick={cancel}
      />
      <Rule />
      {/* Every tool scrolls in one list; cursor stays on top, the controls at the bottom. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MAIN.map((t) => (
          <ToolButton
            key={t.name}
            label={t.label}
            icon={t.icon}
            on={active === t.name}
            onClick={() => start(t.name)}
          />
        ))}
        <Rule />
        {MORE.map((t) => (
          <ToolButton
            key={t.name}
            label={t.label}
            icon={t.icon}
            on={active === t.name}
            onClick={() => start(t.name)}
          />
        ))}
      </div>
      <Rule />
      <ToolButton
        label={magnet ? 'Magnet on: snaps to candles' : 'Magnet off'}
        icon={ICON.magnet}
        on={magnet}
        onClick={() => setMagnet((m) => !m)}
      />
      <ToolButton
        label={locked ? 'Unlock drawings' : 'Lock drawings'}
        icon={locked ? ICON.lock : ICON.unlock}
        on={locked}
        onClick={() => {
          chart?.overrideOverlay({ groupId: DRAWINGS, lock: !locked })
          setLocked((l) => !l)
        }}
      />
      <ToolButton
        label={hidden ? 'Show drawings' : 'Hide drawings'}
        icon={hidden ? ICON.eyeOff : ICON.eye}
        on={hidden}
        onClick={() => {
          chart?.overrideOverlay({ groupId: DRAWINGS, visible: hidden })
          setHidden((h) => !h)
        }}
      />
      <ToolButton
        label="Delete all drawings"
        icon={ICON.trash}
        onClick={() => {
          cancel()
          chart?.removeOverlay({ groupId: DRAWINGS })
        }}
      />
    </div>
  )
}

const Rule = () => <span className="my-1.5 h-px w-6 shrink-0 bg-line" />

function ToolButton({
  label,
  icon,
  on,
  onClick,
}: {
  label: string
  icon: ReactNode
  on?: boolean
  onClick: () => void
}) {
  return (
    <span className="group relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={on}
        className={cx(
          'grid size-9 cursor-pointer place-items-center transition-colors',
          on ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        {icon}
      </button>
      {/* Fixed with no offsets keeps its spot in flow but escapes the scrolling column. */}
      <span
        role="tooltip"
        className="pointer-events-none fixed z-50 -mt-8 ml-10 border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[12px] whitespace-nowrap text-ink opacity-0 shadow-pop transition-opacity group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}
