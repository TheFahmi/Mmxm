'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import { useState } from 'react';

interface Backtest {
  id: string;
  status: string;
  fromTs: string;
  toTs: string;
  params: { name?: string } | null;
  summary: { totalSignals?: number; winRate?: number | null; avgRR?: number | null } | null;
  _count?: { trades: number };
  createdAt: string;
}

export default function BacktestsPage() {
  const [creating, setCreating] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ['backtests'],
    queryFn: () => apiGet<Backtest[]>('/backtests'),
    refetchInterval: 5_000,
  });

  const create = async () => {
    setCreating(true);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86_400_000);
      await apiPost('/backtests', {
        name: `MMXM v1 — last 7d`,
        rangeStart: start.toISOString(),
        rangeEnd: end.toISOString(),
      });
      await refetch();
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Backtests</h1>
          <button onClick={create} disabled={creating}
            className="px-3 py-1.5 rounded bg-yellow-500 text-black text-sm font-medium disabled:opacity-50">
            {creating ? 'Creating…' : 'New backtest (7d)'}
          </button>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted/60 text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Range</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Signals</th>
                <th className="px-3 py-2 text-right">Win Rate</th>
                <th className="px-3 py-2 text-right">Avg RR</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map(b => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2">{b.params?.name ?? b.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {new Date(b.fromTs).toLocaleDateString('id-ID')} — {new Date(b.toTs).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.summary?.totalSignals ?? b._count?.trades ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {b.summary?.winRate != null ? `${(b.summary.winRate * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.summary?.avgRR?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No backtests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Backtest replays historical candles through the same engine — no lookahead, closed candles only.
        </p>
      </main>
    </>
  );
}
