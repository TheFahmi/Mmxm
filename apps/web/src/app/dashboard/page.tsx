'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useWsEvent } from '@/lib/ws';
import { useMarketStore, formatWibTime } from '@/stores/market';
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
  const { bid, ask, spreadPoints, brokerTimestampMs } = useMarketStore();
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

  const { data: winRateData } = useQuery<{
    win: number; loss: number; total: number; winRate: number;
  }>({
    queryKey: ['signals', 'winrate'],
    queryFn: () => apiGet<{ win: number; loss: number; total: number; winRate: number }>('/signals/stats/winrate'),
    refetchInterval: 30_000,
  });
  const { data: simData } = useQuery<SignalListResponse>({
    queryKey: ['signals', 'sim'],
    queryFn: () => apiGet<SignalListResponse>('/signals?limit=200&offset=0'),
    refetchInterval: 60_000,
  });
  const t = terminals?.[0];

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Bid" value={bid?.toFixed(2) ?? '—'} sub={brokerTimestampMs ? `tick ${formatWibTime(brokerTimestampMs)} WIB` : 'waiting'} />
          <StatCard label="Ask" value={ask?.toFixed(2) ?? '—'} />
          <StatCard label="Spread (pts)" value={spreadPoints ?? '—'} tone={spreadPoints != null && spreadPoints > 50 ? 'red' : 'default'} />
          <StatCard label="Win Rate" value={winRateData ? `${winRateData.winRate}%` : '—'} sub={winRateData ? `${winRateData.win} W / ${winRateData.loss} L / ${winRateData.total}` : '—'} />
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
                  <th className="text-right px-3 py-2">TP1</th>
                  <th className="text-right px-3 py-2">TP2</th>
                  <th className="text-right px-3 py-2">TP3</th>
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
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-bullish">{s.takeProfits?.[0] ? Number(s.takeProfits[0].price).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-bullish/70">{s.takeProfits?.[1] ? Number(s.takeProfits[1].price).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{s.takeProfits?.[2] ? Number(s.takeProfits[2].price).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">1:{Number(s.riskReward).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.confidence}</td>
                  </tr>
                ))}
                {signals.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-2xl text-muted-foreground/60">hourglass_empty</span>
                      <p className="text-sm font-medium text-muted-foreground">Belum ada sinyal</p>
                      <p className="text-xs text-muted-foreground/70 max-w-[280px]">Market XAUUSD tutup Sabtu-Minggu — tunggu Senin 05:00 WIB.</p>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <EquitySim signals={simData?.items} />
      </main>
    </>
  );
}

// ponytail: client-side sim dari 200 sinyal terakhir; pindah ke endpoint /stats/equity kalau perlu >200
function EquitySim({ signals }: { signals?: SignalRow[] }) {
  const [deposit, setDeposit] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);

  const sim = useMemo(() => {
    if (!signals) return null;
    const closed = signals.filter(s => ['COMPLETED', 'TP1_HIT', 'TP2_HIT', 'FAILED', 'STOPPED'].includes(s.status));
    // urut kronologis, compound
    const trades = [...closed].reverse().map(s => {
      const entry = Number(s.preferredEntry), sl = Number(s.stopLoss);
      const risk = Math.abs(entry - sl);
      if (risk === 0) return 0;
      const win = s.status !== 'FAILED' && s.status !== 'STOPPED';
      if (!win) return -1;
      const tpIdx = s.status === 'TP2_HIT' ? 1 : 0;
      const tp = s.takeProfits?.[tpIdx]?.price;
      return tp != null ? Math.abs(Number(tp) - entry) / risk : 0;
    });
    let eq = deposit;
    for (const r of trades) eq *= (1 + (riskPct / 100) * r);
    const wins = trades.filter(r => r > 0).length;
    return { n: trades.length, wins, final: eq, sumR: trades.reduce((a, b) => a + b, 0) };
  }, [signals, deposit, riskPct]);

  if (!sim) return null;
  const profit = sim.final - deposit;
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/30">
        <span className="h-7 w-7 rounded-md bg-primary text-background grid place-items-center shrink-0">
          <span className="material-symbols-outlined text-[16px]">trending_up</span>
        </span>
        <div>
          <h2 className="text-sm font-semibold leading-none">Simulasi Equity</h2>
          <p className="text-[11px] text-muted-foreground">Compound dari {sim.n} sinyal closed terakhir · bukan financial advice</p>
        </div>
      </div>
      <div className="px-4 py-4 flex flex-wrap items-end gap-4">
        <label className="text-xs text-muted-foreground">
          <div className="mb-1">Deposit ($)</div>
          <input type="number" min={1} value={deposit} onChange={e => setDeposit(Math.max(1, Number(e.target.value) || 1))}
            className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground tabular-nums" />
        </label>
        <label className="text-xs text-muted-foreground">
          <div className="mb-1">Risk / trade (%)</div>
          <input type="number" min={0.1} step={0.1} value={riskPct} onChange={e => setRiskPct(Math.max(0.1, Number(e.target.value) || 0.1))}
            className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground tabular-nums" />
        </label>
        <div className="ml-auto text-right">
          <div className="text-[11px] text-muted-foreground">Equity akhir</div>
          <div className={`text-2xl font-bold tabular-nums ${profit >= 0 ? 'text-bullish' : 'text-bearish'}`}>
            ${sim.final.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className={`text-xs tabular-nums ${profit >= 0 ? 'text-bullish' : 'text-bearish'}`}>
            {profit >= 0 ? '+' : ''}{profit.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({((profit / deposit) * 100).toFixed(1)}%)
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 flex gap-4 text-[11px] text-muted-foreground tabular-nums">
        <span>Winrate {sim.n ? Math.round((sim.wins / sim.n) * 100) : 0}%</span>
        <span>Total {sim.sumR >= 0 ? '+' : ''}{sim.sumR.toFixed(2)}R</span>
        <span>{sim.wins}W / {sim.n - sim.wins}L</span>
      </div>
    </section>
  );
}

function mxmModel(_m: string) {
  return _m === 'MARKET_MAKER_BUY_MODEL' ? 'MMBM' : 'MMSM';
}
