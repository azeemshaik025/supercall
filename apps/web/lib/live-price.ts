'use client'

// A coin's live price, streamed from the API (Flash's quotes), with the direction of the last
// move so the number can flash up or down. Falls back to the last known price.
import { useEffect, useRef, useState } from 'react'
import { API } from './api'

export function useLivePrice(address: string | undefined, fallback: number) {
  const [value, setValue] = useState(fallback)
  const [dir, setDir] = useState<-1 | 0 | 1>(0)
  const last = useRef(fallback)
  useEffect(() => {
    setValue(fallback)
    last.current = fallback
    setDir(0)
    if (!address) return
    const source = new EventSource(`${API}/markets/${address}/stream`)
    source.addEventListener('price', (e) => {
      const { price } = JSON.parse((e as MessageEvent<string>).data) as { price: number }
      if (!(price > 0)) return
      setDir(price > last.current ? 1 : price < last.current ? -1 : 0)
      last.current = price
      setValue(price)
    })
    return () => source.close()
  }, [address, fallback])
  return { value, dir }
}
