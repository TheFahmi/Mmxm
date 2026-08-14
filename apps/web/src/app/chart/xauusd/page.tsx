'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useWsEvent } from '@/lib/ws';
import { Nav } from '@/components/nav';

interface CandleRow {
  openTime: string;
  open: string; high: string; low: string; close: string;
  timeframe: string;
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'H1'] as const;
type TF = (typeof TIMEFRAMES)[number];

const TF_LIMIT: Record<TF, number> = { M1: 1000, M5: 500, M15: 400, H1: 300 };

export default function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const tickSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [timeframe, setTimeframe] = useState<TF>('M5');

  const { data: candles } = useQuery({
    queryKey: ['candles', timeframe],
    queryFn: () => apiGet<CandleRow[]>(`/market-data/candles?timeframe=${timeframe}&limit=${TF_LIMIT[timeframe]}`),
    refetchInterval: 60_000,
  });

  // Poll latest tick every 1s so the line updates per second even if WS events lag.
  const { data: latestTick } = useQuery({
    queryKey: ['tick', 'latest'],
    queryFn: () => apiGet<{ bid: number; ask: number; brokerTimestampMs: number }>('/market-data/ticks/latest'),
    refetchInterval: 1000,
  });

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.08)' },
        horzLines: { color: 'rgba(148,163,184,0.08)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#16a34a', downColor: '#dc2626',
      borderUpColor: '#16a34a', borderDownColor: '#dc2626',
      wickUpColor: '#16a34a', wickDownColor: '#dc2626',
    });
    const tickSeries = chart.addLineSeries({
      color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    tickSeriesRef.current = tickSeries;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      tickSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candles || !seriesRef.current) return;
    seriesRef.current.setData(candles.map(c => ({
      time: (new Date(c.openTime).getTime() / 1000) as never,
      open: Number(c.open), high: Number(c.high),
      low: Number(c.low), close: Number(c.close),
    })));
  }, [candles]);

  useWsEvent<{ timeframe: string; openTime: string; open: number; high: number; low: number; close: number }>(
    'xauusd.candle.current',
    (c) => {
      if (c.timeframe !== timeframe || !seriesRef.current) return;
      seriesRef.current.update({
        time: (new Date(c.openTime).getTime() / 1000) as never,
        open: c.open, high: c.high, low: c.low, close: c.close,
      });
    },
  );

  // Live tick line (per-price-update, real-time)
  useWsEvent<{ bid: number; ask: number; last: number | null; brokerTimestampMs: number }>(
    'xauusd.tick',
    (t) => {
      if (!tickSeriesRef.current) return;
      const price = t.last ?? t.bid ?? t.ask;
      if (price == null) return;
      // append a new point each time — use monotonic now() so it advances rightward
      const time = (Date.now() / 1000) as never;
      tickSeriesRef.current.update({ time, value: price });
    },
  );

  // Polled tick (guaranteed ~1s cadence) — merge with WS updates.
  useEffect(() => {
    if (!latestTick || !tickSeriesRef.current) return;
    const price = latestTick.bid;
    if (price == null) return;
    // monotonic now() => new point every poll tick, moves rightward
    const time = (Date.now() / 1000) as never;
    tickSeriesRef.current.update({ time, value: price });
  }, [latestTick]);

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">XAUUSD · {timeframe}</h1>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  timeframe === tf ? 'bg-amber-500 text-black font-semibold' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div ref={containerRef} className="h-[600px] rounded-lg border border-border" />
        <p className="text-xs text-muted-foreground">
          Candlestick per timeframe · garis kuning = harga tick real-time. Overlays (FVG/OB/liquidity) dari halaman sinyal.
        </p>
      </main>
    </>
  );
}
