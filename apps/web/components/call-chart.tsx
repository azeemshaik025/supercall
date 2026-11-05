'use client'

import { useMemo } from 'react'
import { candlesFor, marksFor } from '@/lib/data'
import { usd } from '@/lib/format'
import { estimate } from '@/lib/money'
import type { Call } from '@/lib/types'
import { CandleChart } from './candle-chart'

const SIZE = 1000

export function CallChart({ call }: { call: Call }) {
  const candles = useMemo(() => candlesFor(call), [call])
  const levels = useMemo(
    () => ({ target: call.target, entry: call.entry, stop: call.stop }),
    [call],
  )
  const when = useMemo(
    () => ({ createdAt: call.createdAt, filledAt: call.filledAt, fillPrice: call.fillPrice }),
    [call],
  )
  const pnl = useMemo(() => {
    const e = estimate(call, SIZE)
    return { target: `+${usd(e.atTarget)}`, stop: `−${usd(Math.abs(e.atStop))}` }
  }, [call])
  const marks = useMemo(() => marksFor(call.id), [call.id])
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">
        Result on a {usd(SIZE)} copy, after fees and protection. Shaded: before the call was made.
      </p>
      <CandleChart
        candles={candles}
        levels={levels}
        band={call.band}
        call={when}
        pnl={pnl}
        marks={marks}
        height={380}
        precision={call.price < 1 ? 4 : 2}
        label={`Hourly ${call.asset} candles with the call’s target, entry zone and stop`}
      />
    </div>
  )
}
