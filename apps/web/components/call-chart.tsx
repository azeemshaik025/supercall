'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useMemo } from 'react'
import { useCopies } from '@/lib/copy'
import { usd } from '@/lib/format'
import { useMe, walletOf } from '@/lib/me'
import { estimate } from '@/lib/money'
import type { Call, Candle } from '@/lib/types'
import { CandleChart, type ChartMark } from './candle-chart'

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
  // Your own buys and sells of this call, marked on the chart where they filled.
  const { authenticated } = usePrivy()
  const { me } = useMe()
  const { copies } = useCopies(authenticated ? walletOf(me) : undefined)
  const marks = useMemo<ChartMark[]>(
    () =>
      (copies ?? [])
        .filter((c) => c.call === call.id)
        .flatMap((c) => [
          ...(c.fill ? [{ kind: 'in' as const, at: c.fill.at ?? c.at, price: c.fill.price }] : []),
          ...(c.closed?.gotUsd && c.fill && c.closed.at
            ? [{ kind: 'sold' as const, at: c.closed.at, price: c.closed.gotUsd / c.fill.coin }]
            : []),
        ]),
    [copies, call.id],
  )
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
        marks={marks}
        height={380}
        precision={call.price < 1 ? 4 : 2}
        label={`Hourly ${call.asset} candles with the call's target, entry zone and stop`}
      />
    </div>
  )
}
