'use client'

import {
  type Chart,
  dispose,
  init,
  type KLineData,
  LineType,
  PolygonType,
  registerIndicator,
  registerOverlay,
} from 'klinecharts'
import { useEffect, useRef, useState } from 'react'
import type { Candle } from '@/lib/types'

export type Level = 'target' | 'entry' | 'stop'
export type Levels = Record<Level, number>
export type ChartMark = { kind: 'in' | 'sold'; at: string; price: number }

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const font = () => getComputedStyle(document.body).fontFamily

/** Opaque tint of `hex` over the chart surface; canvas can't read color-mix. */
const blend = (hex: string, t: number) => {
  const a = Number.parseInt(hex.slice(1), 16)
  const b = Number.parseInt(token('--sc-surface').slice(1), 16)
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * t + ((b >> sh) & 255) * (1 - t))
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`
}

const levelStyle: Record<Level, { label: string; color: string; dashed?: boolean }> = {
  target: { label: 'Target', color: '--sc-good' },
  entry: { label: 'Entry', color: '--sc-entry', dashed: true },
  stop: { label: 'Stop', color: '--sc-bad' },
}

const range = (l: Levels, band: number) => ({
  hi: Math.max(l.stop, l.target, l.entry * (1 + band)),
  lo: Math.min(l.stop, l.target, l.entry * (1 - band)),
})

const chip = (bg: string, border: string, color: string, weight = 400) => ({
  color,
  size: 11,
  weight,
  family: font(),
  backgroundColor: bg,
  borderColor: border,
  borderSize: 1,
  borderRadius: 0,
  paddingLeft: 7,
  paddingRight: 7,
  paddingTop: 4,
  paddingBottom: 4,
})

let registered = false
function register() {
  if (registered) return
  registered = true
  // Invisible lines at the highest and lowest level, so the price axis always fits them.
  registerIndicator({
    name: 'scRange',
    shortName: '',
    figures: [
      { key: 'hi', type: 'line' },
      { key: 'lo', type: 'line' },
    ],
    styles: {
      lines: [
        {
          style: LineType.Solid,
          smooth: false,
          size: 1,
          dashedValue: [2, 2],
          color: 'rgba(0,0,0,0)',
        },
        {
          style: LineType.Solid,
          smooth: false,
          size: 1,
          dashedValue: [2, 2],
          color: 'rgba(0,0,0,0)',
        },
      ],
    },
    calc: (list, indicator) => {
      const { hi, lo } = indicator.extendData as { hi: number; lo: number }
      return list.map(() => ({ hi, lo }))
    },
    createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [], icons: [] }),
  })
  // A full-width level with its label chip on the left and the follower's result on the right.
  registerOverlay({
    name: 'scLevel',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const y = coordinates[0]?.y ?? 0
      const { label, color, dashed, price, pnl } = overlay.extendData as {
        label: string
        color: string
        dashed?: boolean
        price: string
        pnl?: string
      }
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y },
            ],
          },
          styles: { color, size: 1, style: dashed ? 'dashed' : 'solid', dashedValue: [4, 4] },
        },
        ...(pnl
          ? [
              {
                type: 'text',
                attrs: { x: bounding.width - 8, y, text: pnl, align: 'right', baseline: 'middle' },
                styles: chip(color, color, token('--sc-bg'), 600),
                ignoreEvent: true,
              },
            ]
          : []),
        {
          type: 'text',
          attrs: { x: 12, y, text: `${label}  ${price}`, align: 'left', baseline: 'middle' },
          styles: chip(blend(color, 0.2), color, token('--sc-ink')),
        },
      ]
    },
  })
  // The entry zone: a soft band between its two prices.
  registerOverlay({
    name: 'scBand',
    totalStep: 3,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const y1 = coordinates[0]?.y ?? 0
      const y2 = coordinates[1]?.y ?? 0
      return [
        {
          type: 'rect',
          attrs: { x: 0, y: Math.min(y1, y2), width: bounding.width, height: Math.abs(y2 - y1) },
          styles: { style: 'fill', color: (overlay.extendData as { color: string }).color },
          ignoreEvent: true,
        },
      ]
    },
  })
  // Before the call was made: dimmed, with a dashed line and a label where it starts.
  registerOverlay({
    name: 'scBefore',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding }) => {
      const x = Math.min(Math.max(coordinates[0]?.x ?? 0, 0), bounding.width)
      if (x <= 0) return []
      return [
        {
          type: 'rect',
          attrs: { x: 0, y: 0, width: x, height: bounding.height },
          styles: { style: 'fill', color: 'rgba(4, 9, 14, 0.55)' },
          ignoreEvent: true,
        },
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x, y: 0 },
              { x, y: bounding.height },
            ],
          },
          styles: {
            color: 'rgba(239, 241, 244, 0.35)',
            size: 1,
            style: 'dashed',
            dashedValue: [4, 4],
          },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x: x + 6,
            y: bounding.height - 8,
            text: 'Call made',
            align: 'left',
            baseline: 'bottom',
          },
          styles: chip('rgba(15, 23, 32, 0.9)', 'rgba(239, 241, 244, 0.35)', token('--sc-ink')),
          ignoreEvent: true,
        },
      ]
    },
  })
  // A moment on the call (caller in, you in, sold): a line where it happened, labelled at the foot.
  registerOverlay({
    name: 'scMark',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const x = coordinates[0]?.x ?? -1
      if (x < 0 || x > bounding.width) return []
      const { text, color, row, solid } = overlay.extendData as {
        text: string
        color: string
        row: number
        solid: boolean
      }
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x, y: 0 },
              { x, y: bounding.height },
            ],
          },
          styles: { color, size: 1, style: solid ? 'solid' : 'dashed', dashedValue: [3, 3] },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x: x + 6,
            y: bounding.height - 36 - row * 26,
            text,
            align: 'left',
            baseline: 'bottom',
          },
          styles: solid
            ? chip(color, color, token('--sc-bg'), 600)
            : chip(blend(color, 0.18), color, token('--sc-ink')),
          ignoreEvent: true,
        },
      ]
    },
  })
}

export type ChartCall = { createdAt: string; filledAt?: string; fillPrice?: number }

/**
 * Candles with a call drawn on: levels with labels, the entry zone, everything before the
 * call dimmed, the caller's fill and the viewer's own buys and sells.
 */
export function CandleChart({
  candles,
  levels,
  band = 0,
  onLevel,
  call,
  pnl,
  marks = [],
  volume = true,
  height,
  label,
  precision = 2,
  pick = null,
  onPicked,
}: {
  candles: Candle[]
  levels?: Levels
  band?: number
  /** Makes the levels draggable; omit for a published call. */
  onLevel?: (key: Level, value: number) => void
  call?: ChartCall
  pnl?: Partial<Record<Level, string>>
  marks?: ChartMark[]
  volume?: boolean
  height: number
  label: string
  precision?: number
  /** A level waiting to be placed: the next click on the chart puts it at that price. */
  pick?: Level | null
  /** After a pick lands, so the form can drop the picking state. */
  onPicked?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const ids = useRef<Partial<Record<Level, string>>>({})
  const bandId = useRef<string | null>(null)
  const dragging = useRef<Level | null>(null)
  const onLevelRef = useRef(onLevel)
  onLevelRef.current = onLevel
  const [built, setBuilt] = useState(0)
  const readOnly = !onLevel

  // Build once per data set and call; levels, band and pnl are moved in place below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt for new data or a new call only
  useEffect(() => {
    const el = box.current
    if (!el) return
    register()
    const good = token('--sc-good')
    const bad = token('--sc-bad')
    const muted = token('--sc-muted')
    const line = token('--sc-line')
    const chart = init(el, {
      styles: {
        grid: { horizontal: { color: line }, vertical: { color: line } },
        candle: {
          bar: {
            upColor: good,
            downColor: bad,
            noChangeColor: muted,
            upBorderColor: good,
            downBorderColor: bad,
            noChangeBorderColor: muted,
            upWickColor: good,
            downWickColor: bad,
            noChangeWickColor: muted,
          },
          priceMark: { last: { upColor: good, downColor: bad, line: { show: false } } },
          tooltip: { text: { color: muted, family: font() } },
        },
        indicator: { tooltip: { text: { color: muted, family: font() } } },
        xAxis: {
          axisLine: { color: line },
          tickLine: { color: line },
          tickText: { color: muted, family: font() },
        },
        yAxis: {
          axisLine: { color: line },
          tickLine: { color: line },
          tickText: { color: muted, family: font() },
        },
        separator: { color: line },
        crosshair: { horizontal: { line: { color: muted } }, vertical: { line: { color: muted } } },
      },
    })
    if (!chart) return
    chartRef.current = chart
    chart.setPriceVolumePrecision(precision, 0)
    const data: KLineData[] = candles.map((c) => ({
      timestamp: c.t,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
      volume: c.v,
    }))
    chart.applyNewData(data)

    if (volume) {
      chart.createIndicator(
        {
          name: 'VOL',
          shortName: 'Volume',
          calcParams: [],
          styles: {
            bars: [
              {
                style: PolygonType.Fill,
                borderStyle: LineType.Solid,
                borderSize: 0,
                borderDashedValue: [2, 2],
                upColor: `${good}66`,
                downColor: `${bad}66`,
                noChangeColor: `${muted}66`,
              },
            ],
          },
        },
        false,
        { id: 'sc_volume', height: 64, minHeight: 40, dragEnabled: true },
      )
    }

    if (levels) {
      chart.createIndicator({ name: 'scRange', extendData: range(levels, band) }, true, {
        id: 'candle_pane',
      })
      const b = chart.createOverlay({
        name: 'scBand',
        lock: true,
        points: [{ value: levels.entry * (1 + band) }, { value: levels.entry * (1 - band) }],
        extendData: { color: `${token('--sc-entry')}1f` },
      })
      if (typeof b === 'string') bandId.current = b
      for (const key of Object.keys(levelStyle) as Level[]) {
        const s = levelStyle[key]
        const id = chart.createOverlay({
          name: 'scLevel',
          lock: readOnly,
          points: [{ value: levels[key] }],
          extendData: {
            label: s.label,
            color: token(s.color),
            dashed: s.dashed,
            price: levels[key].toLocaleString('en-US', { maximumFractionDigits: precision }),
            pnl: pnl?.[key],
          },
          onPressedMoveStart: () => {
            dragging.current = key
            return false
          },
          onPressedMoving: ({ overlay }) => {
            setTimeout(() => {
              const v = overlay.points[0]?.value
              if (v !== undefined) onLevelRef.current?.(key, v)
            })
            return false
          },
          onPressedMoveEnd: ({ overlay }) => {
            dragging.current = null
            const v = overlay.points[0]?.value
            if (v !== undefined) onLevelRef.current?.(key, v)
            return false
          },
        })
        if (typeof id === 'string') ids.current[key] = id
      }
    }

    if (call) {
      chart.createOverlay({
        name: 'scBefore',
        lock: true,
        points: [{ timestamp: Date.parse(call.createdAt), value: levels?.entry ?? 0 }],
      })
      if (call.filledAt) {
        chart.createOverlay({
          name: 'scMark',
          lock: true,
          points: [
            { timestamp: Date.parse(call.filledAt), value: call.fillPrice ?? levels?.entry ?? 0 },
          ],
          extendData: {
            text: `Caller in · ${(call.fillPrice ?? levels?.entry ?? 0).toLocaleString('en-US', { maximumFractionDigits: precision })}`,
            color: token('--sc-entry'),
            row: 0,
            solid: false,
          },
        })
      }
    }

    // Follow the box: the sidebar folding or the window resizing changes its width.
    const resizer = new ResizeObserver(() => chart.resize())
    resizer.observe(el)
    setBuilt((n) => n + 1)
    return () => {
      resizer.disconnect()
      dispose(el)
      chartRef.current = null
      ids.current = {}
      bandId.current = null
    }
  }, [candles, call, readOnly, volume, precision])

  // The viewer's own buys and sells, stacked above the caller's mark.
  const marksKey = JSON.stringify(marks)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !built) return
    const made = (JSON.parse(marksKey) as ChartMark[]).map((m, i) =>
      chart.createOverlay({
        name: 'scMark',
        lock: true,
        points: [{ timestamp: Date.parse(m.at), value: m.price }],
        extendData: {
          text: `${m.kind === 'in' ? 'You in' : 'Sold'} · ${m.price.toLocaleString('en-US', { maximumFractionDigits: precision })}`,
          color: m.kind === 'in' ? token('--sc-ink') : token('--sc-warn'),
          row: i + 1,
          solid: true,
        },
      }),
    )
    return () => {
      for (const id of made) if (typeof id === 'string') chart.removeOverlay({ id })
    }
  }, [marksKey, built, precision])

  // Form edits move the lines and refresh their labels without a rebuild.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !levels || !built) return
    chart.overrideIndicator({ name: 'scRange', extendData: range(levels, band) }, 'candle_pane')
    if (bandId.current) {
      chart.overrideOverlay({
        id: bandId.current,
        points: [{ value: levels.entry * (1 + band) }, { value: levels.entry * (1 - band) }],
      })
    }
    for (const key of Object.keys(levelStyle) as Level[]) {
      const id = ids.current[key]
      if (!id) continue
      const s = levelStyle[key]
      chart.overrideOverlay({
        id,
        ...(dragging.current === key ? {} : { points: [{ value: levels[key] }] }),
        extendData: {
          label: s.label,
          color: token(s.color),
          dashed: s.dashed,
          price: levels[key].toLocaleString('en-US', { maximumFractionDigits: precision }),
          pnl: pnl?.[key],
        },
      })
    }
  }, [levels, band, pnl, built, precision])

  // Picking a level: a click on the chart places it at the clicked price.
  const onPickedRef = useRef(onPicked)
  onPickedRef.current = onPicked
  useEffect(() => {
    const el = box.current
    const chart = chartRef.current
    if (!pick || !el || !chart || !built) return
    const place = (e: MouseEvent) => {
      const y = e.clientY - el.getBoundingClientRect().top
      const found = chart.convertFromPixel([{ y }], { paneId: 'candle_pane' })
      const value = (Array.isArray(found) ? found[0] : found)?.value
      if (value !== undefined && value > 0) onLevelRef.current?.(pick, value)
      onPickedRef.current?.()
    }
    el.addEventListener('click', place)
    el.style.cursor = 'crosshair'
    return () => {
      el.removeEventListener('click', place)
      el.style.cursor = ''
    }
  }, [pick, built])

  return (
    <div ref={box} role="img" aria-label={label} style={{ height }} className="w-full min-w-0" />
  )
}
