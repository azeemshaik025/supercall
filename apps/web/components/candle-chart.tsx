'use client'

import { type DeepPartial, type KLineData, type Styles, dispose, init } from 'klinecharts'
import { useEffect, useRef } from 'react'
import type { Candle } from '@/lib/types'

export type Level = { value: number; color: string; dashed?: boolean }

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function styles(): DeepPartial<Styles> {
  const good = css('--sc-good')
  const bad = css('--sc-bad')
  const muted = css('--sc-muted')
  const line = css('--sc-line')
  return {
    grid: { horizontal: { color: line }, vertical: { show: false } },
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
      priceMark: { last: { upColor: good, downColor: bad, line: { style: 'dashed' as never } } },
      tooltip: { text: { color: muted } },
    },
    xAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: { color: muted } },
    yAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: { color: muted } },
    separator: { color: line },
    crosshair: { horizontal: { line: { color: muted } }, vertical: { line: { color: muted } } },
  }
}

/** Candles from KLineChart, with the call's levels drawn as locked horizontal lines. */
export function CandleChart({
  candles,
  levels = [],
  height = 320,
  volume = false,
  label,
  hourMs = 3_600_000,
  endAt,
}: {
  candles: Candle[]
  levels?: Level[]
  height?: number
  volume?: boolean
  label: string
  hourMs?: number
  endAt: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = init(el, { styles: styles() })
    if (!chart) return
    const data: KLineData[] = candles.map((c, i) => ({
      timestamp: endAt - (candles.length - 1 - i) * hourMs,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
      volume: c.v,
    }))
    chart.applyNewData(data)
    if (volume) chart.createIndicator('VOL', false, { height: 70 })
    for (const l of levels) {
      chart.createOverlay({
        name: 'horizontalStraightLine',
        lock: true,
        points: [{ value: l.value }],
        styles: { line: { color: l.color.startsWith('--') ? css(l.color) : l.color, style: (l.dashed ? 'dashed' : 'solid') as never, dashedValue: [4, 4] } },
      })
    }
    return () => dispose(el)
  }, [candles, levels, volume, hourMs, endAt])
  return <div ref={ref} role="img" aria-label={label} style={{ height }} className="w-full" />
}
