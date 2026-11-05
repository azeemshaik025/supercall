'use client'

import { useMemo, useState } from 'react'
import { candlesFor, NOW } from '@/lib/data'
import type { Call } from '@/lib/types'
import { CandleChart, type Level } from './candle-chart'
import { Segmented } from './ui'

const RANGES = ['1H', '1D', '3D', 'All'] as const
const COUNT = { '1H': 20, '1D': 40, '3D': 72, All: 96 } as const

export function CallChart({ call }: { call: Call }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>('1D')
  const candles = useMemo(() => candlesFor(call, COUNT[range]), [call, range])
  const levels = useMemo<Level[]>(
    () => [
      { value: call.target, color: '--sc-good', dashed: true },
      { value: call.entry, color: '--sc-entry', dashed: true },
      { value: call.stop, color: '--sc-bad', dashed: true },
    ],
    [call],
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3.5 border-t border-dashed border-good" />
            Target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3.5 border-t border-dashed border-entry" />
            Entry
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3.5 border-t border-dashed border-bad" />
            Stop
          </span>
        </span>
        <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
      </div>
      <CandleChart
        candles={candles}
        levels={levels}
        height={340}
        label={`Hourly ${call.asset} candles since the call`}
        endAt={NOW.getTime()}
      />
    </div>
  )
}
