'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import { computeSim } from '@/lib/sim';

interface SignalRow {
  id: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  mmxmModel: string;
  preferredEntry: string;
  stopLoss: string;
  riskReward: string;
  confidence: number;
  setupTf: string;
  detectedAt: string;
  aiInsight: {
    verdict: 'AGREE' | 'DISAGREE' | 'NEUTRAL';
    summary: string;
    keyLevels: string[];
    risks: string[];
    suggestion: string;
  } | null;
  aiVerified: boolean;
  takeProfits: { level: number; price: number; allocationPercentage: number }[];
}

const STATUSES = ['', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE', 'TP1_HIT', 'TP2_HIT', 'COMPLETED', 'FAILED', 'STOPPED', 'INVALIDATED', 'EXPIRED'];
const VERDICTS = ['', 'AGREE', 'DISAGREE', 'NEUTRAL'];
const CONFIDENCE = [
  { label: 'All confidence', min: 0 },
  { label: 'Conf ≥ 65', min: 65 },
  { label: 'Conf ≥ 75', min: 75 },
  { label: 'Conf ≥ 85', min: 85 },
];

/** TP hit level from monotonic status progression. */
function tpHitCount(status: string): number {
  if (status === 'COMPLETED') return 3;
  if (status === 'TP2_HIT') return 2;
  if (status === 'TP1_HIT') return 1;
  return 0;
}

export default function SignalsPage() {
  const [status, setStatus] = useState('');
  const [verdict, setVerdict] = useState('');
  const [confIdx, setConfIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [deposit, setDeposit] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);
  const [maxLot, setMaxLot] = useState(1);

  const { data } = useQuery({
    queryKey: ['signals', status, verdict, confIdx, page],
    queryFn: () => apiGet<{ items: SignalRow[]; total: number }>(
      `/signals?limit=20&offset=${(page - 1) * 20}` +
      `${status ? `&status=${status}` : ''}` +
      `${verdict ? `&verdict=${verdict}` : ''}` +
      `${CONFIDENCE[confIdx]?.min ? `&minConf=${CONFIDENCE[confIdx].min}` : ''}`,
    ),
    refetchInterval: 20_000,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  const filtered = data?.items ?? [];

  // Lot + modal per trade di halaman ini (risk-based dari deposit, cap maxLot)
  // ponytail: compound per halaman, bukan full-history — cukup untuk gambaran sizing
  const sim = useMemo(() => {
    if (!data?.items) return null;
    return computeSim(filtered, { deposit, riskPct, maxLot });
  }, [data, deposit, riskPct, maxLot]);

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-semibold">Signals</h1>
          <span className="text-xs text-muted-foreground">
            {data?.total != null ? `${data.total} signal` : ''} · {filtered.length} di halaman ini
          </span>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Status</span>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s || 'Semua'}</option>)}
            </select>
          </label>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">AI Verdict</span>
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {['', 'AGREE', 'DISAGREE', 'NEUTRAL'].map(v => (
                <button
                  key={v}
                  onClick={() => { setVerdict(v); setPage(1); }}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    verdict === v ? 'bg-amber-500 text-black font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  {v === '' ? 'Semua' : v === 'AGREE' ? 'Agree' : v === 'DISAGREE' ? 'Disagree' : 'Neutral'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Confidence</span>
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {CONFIDENCE.map((c, i) => (
                <button
                  key={c.label}
                  onClick={() => { setConfIdx(i); setPage(1); }}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    confIdx === i ? 'bg-amber-500 text-black font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  {c.min === 0 ? 'Semua' : `≥${c.min}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sizing inputs */}
        <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center gap-4">
          <span className="text-xs font-medium text-foreground">Sizing:</span>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Modal ($)</span>
            <input type="number" min={1} value={deposit} onChange={e => setDeposit(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Risk (%)</span>
            <input type="number" min={0.1} step={0.1} value={riskPct} onChange={e => setRiskPct(Math.max(0.1, Number(e.target.value) || 0.1))}
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Max lot</span>
            <input type="number" min={0.01} step={0.01} value={maxLot} onChange={e => setMaxLot(Math.max(0.01, Number(e.target.value) || 0.01))}
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums" />
          </label>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Time (WIB)</th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Setup TF</th>
                <th className="text-right px-3 py-2">Entry</th>
                <th className="text-right px-3 py-2">SL</th>
                <th className="text-right px-3 py-2">Lot</th>
                <th className="text-right px-3 py-2">Modal</th>
                <th className="text-right px-3 py-2">TP1</th>
                <th className="text-right px-3 py-2">TP2</th>
                <th className="text-right px-3 py-2">TP3</th>
                <th className="text-right px-3 py-2">RR</th>
                <th className="text-right px-3 py-2">Conf</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const hit = tpHitCount(s.status);
                const tps = [0, 1, 2].map(i => s.takeProfits?.[i] ? Number(s.takeProfits[i].price) : null);
                const row = sim?.rows.find(r => r.s.id === s.id);
                return (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/signals/${s.id}`} className="hover:underline">
                      {new Date(s.detectedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 font-medium ${s.direction === 'LONG' ? 'text-bullish' : 'text-bearish'}`}>{s.direction}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.mmxmModel === 'MARKET_MAKER_BUY_MODEL' ? 'MMBM' : 'MMSM'}</td>
                  <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{s.setupTf}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(s.preferredEntry).toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${hit > 0 ? 'text-destructive' : ''}`}>{Number(s.stopLoss).toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row && row.lot >= maxLot && row.lot > 0 ? 'text-amber-500 font-medium' : ''}`}>{row ? row.lot.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row ? `$${(row.lot * row.slDist * 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}</td>
                  {tps.map((p, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums text-xs text-bullish">
                      <span className="inline-flex items-center gap-1">
                        {hit > i ? (
                          <span className={`material-symbols-outlined text-[14px] ${hit === 3 ? 'text-bullish' : 'text-yellow-500'}`}>check_circle</span>
                        ) : (
                          s.status === 'STOPPED' ? <span className="material-symbols-outlined text-[14px] text-destructive">cancel</span> : <span className="material-symbols-outlined text-[14px] text-muted-foreground/40">radio_button_unchecked</span>
                        )}
                        {p != null ? p.toFixed(2) : '—'}
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{Number(s.riskReward).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.confidence}</td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={14} className="px-3 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-3xl text-muted-foreground/60">hourglass_empty</span>
                    <p className="text-sm font-medium text-muted-foreground">Belum ada sinyal</p>
                    <p className="text-xs text-muted-foreground/70 max-w-[320px]">Market XAUUSD tutup Sabtu-Minggu. Sinyal MMAI v1 akan muncul lagi Senin 05:00 WIB saat market buka.</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded border border-border disabled:opacity-40">← Prev</button>
          <span className="px-2 py-1 text-muted-foreground">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded border border-border disabled:opacity-40">Next →</button>
        </div>
      </main>
    </>
  );
}
