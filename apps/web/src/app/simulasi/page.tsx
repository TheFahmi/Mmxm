'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import Link from 'next/link';

interface SignalRow {
  id: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  preferredEntry: string;
  detectedAt: string;
  takeProfits: { level: number; price: number }[];
  stopLoss: string;
}

type SignalListResponse = { items: SignalRow[]; total?: number };

export default function SimulasiPage() {
  const [deposit, setDeposit] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);

  const { data, isLoading } = useQuery<SignalListResponse>({
    queryKey: ['signals', 'sim'],
    queryFn: async () => {
      // ponytail: loop semua halaman (limit 200/request) — ganti ke endpoint khusus kalau >2k sinyal
      const first = await apiGet<SignalListResponse>('/signals?limit=200&offset=0');
      const items = [...first.items];
      while (items.length < (first.total ?? 0)) {
        const next = await apiGet<SignalListResponse>(`/signals?limit=200&offset=${items.length}`);
        if (!next.items?.length) break;
        items.push(...next.items);
      }
      return { items, total: items.length };
    },
    refetchInterval: 60_000,
  });

  const sim = useMemo(() => {
    if (!data?.items) return null;
    const closed = data.items.filter(s => ['COMPLETED', 'TP1_HIT', 'TP2_HIT', 'FAILED', 'STOPPED'].includes(s.status));
    // urut kronologis, compound
    const trades = [...closed].reverse().map(s => {
      const entry = Number(s.preferredEntry), sl = Number(s.stopLoss);
      const risk = Math.abs(entry - sl);
      if (risk === 0) return { s, r: 0 };
      const win = s.status !== 'FAILED' && s.status !== 'STOPPED';
      let r = -1;
      if (win) {
        const tpIdx = s.status === 'TP2_HIT' ? 1 : 0;
        const tp = s.takeProfits?.[tpIdx]?.price;
        r = tp != null ? Math.abs(Number(tp) - entry) / risk : 0;
      }
      return { s, r };
    });
    let eq = deposit;
    const rows = trades.map(tr => {
      const pnl = eq * (riskPct / 100) * tr.r;
      eq += pnl;
      return { ...tr, pnl, eqAfter: eq };
    });
    const wins = rows.filter(x => x.r > 0).length;
    return { rows, n: rows.length, wins, final: eq, sumR: rows.reduce((a, x) => a + x.r, 0) };
  }, [data, deposit, riskPct]);

  const profit = sim ? sim.final - deposit : 0;

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Simulasi Equity</h1>
          <p className="text-xs text-muted-foreground">Compound dari semua sinyal closed · bukan financial advice</p>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
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
                ${sim ? sim.final.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
              </div>
              <div className={`text-xs tabular-nums ${profit >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                {profit >= 0 ? '+' : ''}{profit.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({((profit / deposit) * 100).toFixed(1)}%)
              </div>
            </div>
          </div>
          {sim && (
            <div className="px-4 pb-3 flex gap-4 text-[11px] text-muted-foreground tabular-nums">
              <span>Winrate {sim.n ? Math.round((sim.wins / sim.n) * 100) : 0}%</span>
              <span>Total {sim.sumR >= 0 ? '+' : ''}{sim.sumR.toFixed(2)}R</span>
              <span>{sim.wins}W / {sim.n - sim.wins}L</span>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">R</th>
                <th className="text-right px-3 py-2">P/L</th>
                <th className="text-right px-3 py-2">Equity</th>
              </tr>
            </thead>
            <tbody>
              {sim?.rows.slice().reverse().map((row, i) => (
                <tr key={`${row.s.id}-${i}`} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/signals/${row.s.id}`} className="hover:underline">
                      {new Date(row.s.detectedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 font-medium ${row.s.direction === 'LONG' ? 'text-bullish' : 'text-bearish'}`}>{row.s.direction}</td>
                  <td className="px-3 py-2"><StatusBadge status={row.s.status} /></td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.r >= 0 ? 'text-bullish' : 'text-bearish'}`}>{row.r >= 0 ? '+' : ''}{row.r.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.pnl >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                    {row.pnl >= 0 ? '+' : '-'}${Math.abs(row.pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">${row.eqAfter.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {isLoading && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">Memuat…</td></tr>
              )}
              {sim && sim.n === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">Belum ada sinyal closed</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
