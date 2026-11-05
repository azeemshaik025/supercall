'use client'

import { useMemo, useState } from 'react'
import { HOUR } from '@/lib/candles'
import { marketBySymbol, marketCandles } from '@/lib/data'
import type { Asset } from '@/lib/types'
import { CandleChart } from './candle-chart'
import { Segmented } from './ui'

const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const
const MS = { '15m': HOUR / 4, '1h': HOUR, '4h': HOUR * 4, '1d': HOUR * 24 } as const

export function MarketChart({ asset }: { asset: Asset }) {
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>('1h')
  const candles = useMemo(() => marketCandles(asset, 90, MS[tf]), [asset, tf])
  const p = marketBySymbol(asset)?.price ?? 1
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-3.5">
        <span className="text-[12px] text-muted">
          Price from Definitive Flash · candles from the deepest pool on Arc
        </span>
        <Segmented label="Timeframe" options={TIMEFRAMES} value={tf} onChange={setTf} />
      </div>
      <div className="px-5 pt-4 pb-5">
        <CandleChart
          candles={candles}
          height={480}
          precision={p < 1 ? 4 : 2}
          label={`${asset} candles with volume`}
        />
      </div>
    </div>
  )
}
