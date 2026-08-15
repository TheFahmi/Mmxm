'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useWsEvent } from '@/lib/ws';
import { useMarketStore } from '@/stores/market';
import { Nav } from '@/components/nav';
import { StatCard, StatusBadge } from '@/components/ui';
import Link from 'next/link';

interface Terminal {
  id: string;
  terminalId: string;
  brokerName: string;
  serverName: string;
  brokerSymbol: string;
  computedStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  heartbeatAgeSeconds: number;
  lastHeartbeatAt: string | null;
}

interface SignalRow {
  id: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  mmxmModel: string;
  preferredEntry: string;
  confidence: number;
  detectedAt: string;
  takeProfits: { level: number; price: number; allocationPercentage: number }[];
  stopLoss: string;
  riskReward: string;
}

type SignalListResponse = { items: SignalRow[] };

export default function DashboardPage() {
  const { bid, ask, spreadPoints, lastTickAt } = useMarketStore();
  const setTick = useMarketStore(s => s.setTick);

  const wsConnected = useWsEvent<{ bid: number; ask: number; spreadPoints: number; brokerTimestampMs: number }>(
    'xauusd.tick', (t) => setTick(t),
  );

  const { data: latestTick } = useQuery({
    queryKey: ['tick', 'latest'],
    queryFn: () => apiGet<{ bid: number; ask: number; spreadPoints: number; brokerTimestampMs: number }>('/market-data/ticks/latest'),
    refetchInterval: 1000,
  });
  useEffect(() => {
    if (latestTick && latestTick.bid != null) setTick(latestTick);
  }, [latestTick, setTick]);

  const { data: llmVerdict } = useQuery({
    queryKey: ['llm-verdict'],
    queryFn: () => apiGet<{
      at: string;
      direction: string;
      summary: string;
      reasons: { code: string; description: string }[];
      entry: number | null;
      stopLoss: number | null;
    } | null>('/market-data/llm-verdict'),
    refetchInterval: 10_000,
  });

  const { data: terminals } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => apiGet<Terminal[]>('/terminals'),
    refetchInterval: 10_000,
  });
  const { data: signalsData } = useQuery<SignalListResponse>({
    queryKey: ['signals', 'latest'],
    queryFn: () => apiGet<SignalListResponse>('/signals?limit=5'),
    refetchInterval: 15_000,
  });
  const signals = signalsData?.items ?? [];
  const t = terminals?.[0];

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Bid" value={bid?.toFixed(2) ?? '—'} sub={lastTickAt ? `tick ${new Date(lastTickAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` : 'waiting'} />
          <StatCard label="Ask" value={ask?.toFixed(2) ?? '—'} />
          <StatCard label="Spread (pts)" value={spreadPoints ?? '—'} tone={spreadPoints != null && spreadPoints > 50 ? 'red' : 'default'} />
          <StatCard
            label="MT5 Terminal"
            value={t ? <StatusBadge status={t.computedStatus} /> : '—'}
            sub={t ? `${t.brokerName} · ${t.brokerSymbol}` : 'no terminal'}
            tone={t?.computedStatus === 'ONLINE' ? 'green' : t?.computedStatus === 'DEGRADED' ? 'yellow' : 'red'}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-bullish' : 'bg-bearish'}`} />
          WebSocket {wsConnected ? 'connected' : 'disconnected (REST fallback)'}
        </div>

        {llmVerdict && (
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <span className="h-7 w-7 rounded-md bg-foreground text-background grid place-items-center shrink-0">
                  <span className="material-symbols-outlined text-[16px]">psychology</span>
                </span>
                <div>
                  <h2 className="text-sm font-semibold leading-none">AI Insight</h2>
                  <p className="text-[11px] text-muted-foreground">MMAI v1 · {llmVerdict.at ? new Date(llmVerdict.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '—'}</p>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                llmVerdict.direction === 'NONE' ? 'bg-muted text-muted-foreground border-border' :
                llmVerdict.direction === 'LONG' ? 'bg-bullish/10 text-bullish border-bullish/20' : 'bg-bearish/10 text-bearish border-bearish/20'
              }`}>
                {llmVerdict.direction === 'NONE' ? 'No Setup' : llmVerdict.direction}
              </span>
            </div>
            <div className="px-4 py-3.5 space-y-3">
              <p className="text-sm leading-relaxed text-foreground">{llmVerdict.summary || 'No valid trade setup detected — waiting for a clean structure.'}</p>
              {llmVerdict.reasons?.length > 0 && (
                <div className="space-y-1.5">
                  {llmVerdict.reasons.map((r, i) => (
                    <div key={i} className="rounded-md bg-muted/40 border border-border/60 px-3 py-2.5 space-y-1">
                      <div className="text-[11px] font-mono font-medium tracking-wide text-muted-foreground">{r.code}</div>
                      <div className="text-xs leading-relaxed text-foreground">{r.description}</div>
                    </div>
                  ))}
                </div>
              )}
              {llmVerdict.direction === 'NONE' && (llmVerdict.entry != null || llmVerdict.stopLoss != null) && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                  <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0">hourglass_empty</span>
                  <span className="text-xs leading-relaxed">
                    <span className="text-muted-foreground">Tunggu harga ke</span>{' '}
                    <span className="tabular-nums font-semibold text-foreground">
                      {llmVerdict.entry != null ? `entry ${llmVerdict.entry.toFixed(2)}` : ''}
                      {llmVerdict.entry != null && llmVerdict.stopLoss != null ? ' · ' : ''}
                      {llmVerdict.stopLoss != null ? `SL ${llmVerdict.stopLoss.toFixed(2)}` : ''}
                    </span>
                    <span className="text-muted-foreground"> sebelum setup valid.</span>
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Latest Signals</h2>
            <Link href="/signals" className="text-sm text-yellow-500 hover:underline">View all →</Link>
          </div>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Direction</th>
                  <th className="text-left px-3 py-2">Model</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Entry</th>
                  <th className="text-right px-3 py-2">SL</th>
                  <th className="text-right px-3 py-2">TP1 · TP2 · TP3</th>
                  <th className="text-right px-3 py-2">RR</th>
                  <th className="text-right px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/signals/${s.id}`} className="hover:underline">
                        {new Date(s.detectedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                      </Link>
                    </td>
                    <td className={`px-3 py-2 font-medium ${s.direction === 'LONG' ? 'text-bullish' : 'text-bearish'}`}>{s.direction}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.mmxmModel === 'MARKET_MAKER_BUY_MODEL' ? 'MMBM' : 'MMSM'}</td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(s.preferredEntry).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(s.stopLoss).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{s.takeProfits?.map(tp => Number(tp.price).toFixed(2)).join(' · ') ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">1:{Number(s.riskReward).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.confidence}</td>
                  </tr>
                ))}
                {signals.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No signals yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function mxmModel(_m: string) {
  return _m === 'MARKET_MAKER_BUY_MODEL' ? 'MMBM' : 'MMSM';
}
