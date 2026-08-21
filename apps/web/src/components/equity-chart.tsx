'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, type IChartApi } from 'lightweight-charts';

interface Point {
  time: string; // ISO
  value: number;
}

/** Equity curve chart — lightweight-charts v4, area series. */
export default function EquityChart({ points, baseline }: { points: Point[]; baseline: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: 224,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8b8f98' },
      grid: { vertLines: { color: 'rgba(128,128,128,0.08)' }, horzLines: { color: 'rgba(128,128,128,0.08)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;
    const series = chart.addAreaSeries({
      lineColor: '#F48525',
      topColor: 'rgba(244,133,37,0.25)',
      bottomColor: 'rgba(244,133,37,0.02)',
      lineWidth: 2,
    });
    series.setData(points.map(p => ({ time: p.time.slice(0, 10) as never, value: p.value })));
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  useEffect(() => {
    const onResize = () => chartRef.current?.applyOptions({});
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Equity Curve</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">Baseline ${baseline.toLocaleString('en-US')}</span>
      </div>
      <div ref={ref} className="h-56 w-full" />
    </div>
  );
}
