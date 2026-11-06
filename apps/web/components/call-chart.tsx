'use client'

import { useMemo } from 'react'
import { usd } from '@/lib/format'
import { estimate } from '@/lib/money'
import type { Call, Candle } from '@/lib/types'
import { CandleChart } from './candle-chart'

const SIZE = 1000

export function CallChart({ call, candles }: { call: Call; candles: Candle[] }) {
  const levels = useMemo(
    () => ({ target: call.target, entry: call.entry, stop: call.stop }),
    [call],
  )
  const pnl = useMemo(() => {
    const e = estimate(call, SIZE)
    return { target: `+${usd(e.atTarget)}`, stop: `−${usd(Math.abs(e.atStop))}` }
  }, [call])
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">
        Result on a {usd(SIZE)} copy, after fees and protection.
      </p>
      <CandleChart
        candles={candles}
        levels={levels}
        band={call.bandPct}
        pnl={pnl}
        height={380}
        precision={call.price < 1 ? 4 : 2}
        label={`Hourly ${call.asset} candles with the call's target, entry zone and stop`}
      />
    </div>
  )
}
