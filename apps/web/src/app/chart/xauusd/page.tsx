'use client';

import { useEffect, useRef } from 'react';
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

export default function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const { data: candles } = useQuery({
    queryKey: ['candles', 'M5'],
    queryFn: () => apiGet<CandleRow[]>('/market-data/candles?timeframe=M5&limit=500'),
    refetchInterval: 60_000,
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
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
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
    'xauusd.candle.updated',
    (c) => {
      if (c.timeframe !== 'M5' || !seriesRef.current) return;
      seriesRef.current.update({
        time: (new Date(c.openTime).getTime() / 1000) as never,
        open: c.open, high: c.high, low: c.low, close: c.close,
      });
    },
  );

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-semibold">XAUUSD · M5</h1>
        <div ref={containerRef} className="h-[600px] rounded-lg border border-border" />
        <p className="text-xs text-muted-foreground">
          Overlays (FVG/OB/liquidity/entry zones) render from signal detail pages. Analysis only.
        </p>
      </main>
    </>
  );
}
