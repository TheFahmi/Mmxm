'use client';

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
}

export default function DashboardPage() {
  const { bid, ask, spreadPoints, lastTickAt } = useMarketStore();
  const setTick = useMarketStore(s => s.setTick);

  const wsConnected = useWsEvent<{ bid: number; ask: number; spreadPoints: number; brokerTimestampMs: number }>(
    'xauusd.tick.updated', (t) => setTick(t),
  );

  const { data: terminals } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => apiGet<Terminal[]>('/terminals'),
    refetchInterval: 10_000,
  });
  const { data: signals } = useQuery({
    queryKey: ['signals', 'latest'],
    queryFn: () => apiGet<{ items: SignalRow[] }>('/signals?limit=5'),
    refetchInterval: 15_000,
  });

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

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Latest Signals</h2>
            <Link href="/signals" className="text-sm text-yellow-500 hover:underline">View all →</Link>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Direction</th>
                  <th className="text-left px-3 py-2">Model</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Entry</th>
                  <th className="text-right px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(signals?.items ?? []).map(s => (
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
                    <td className="px-3 py-2 text-right tabular-nums">{s.confidence}</td>
                  </tr>
                ))}
                {signals?.items.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No signals yet.</td></tr>
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
