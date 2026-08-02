'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';

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
}

const STATUSES = ['', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'INVALIDATED', 'EXPIRED'];

export default function SignalsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['signals', status, page],
    queryFn: () => apiGet<{ items: SignalRow[]; total: number }>(
      `/signals?limit=20&offset=${(page - 1) * 20}${status ? `&status=${status}` : ''}`,
    ),
    refetchInterval: 20_000,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Signals</h1>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="bg-muted border border-border rounded px-2 py-1 text-sm"
          >
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
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
                <th className="text-right px-3 py-2">RR</th>
                <th className="text-right px-3 py-2">Conf</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map(s => (
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
                  <td className="px-3 py-2 text-right tabular-nums">{Number(s.stopLoss).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(s.riskReward).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.confidence}</td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No signals.</td></tr>
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
