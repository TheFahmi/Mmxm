'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge, StatCard } from '@/components/ui';

interface Terminal {
  id: string;
  terminalId: string;
  terminalName: string;
  terminalBuild: number;
  brokerName: string;
  serverName: string;
  brokerSymbol: string;
  canonicalSymbol: string;
  digits: number;
  contractSize: string;
  computedStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  heartbeatAgeSeconds: number;
  lastHeartbeatAt: string | null;
  eaVersion: string | null;
}

export default function DataSourcePage() {
  const { data: terminals } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => apiGet<Terminal[]>('/terminals'),
    refetchInterval: 5_000,
  });
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<{ status: string; db: string; redis: string }>('/health'),
    refetchInterval: 10_000,
  });

  const t = terminals?.[0];

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-lg font-semibold">Data Source — MT5 Bridge</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="API Health" value={health?.status ?? '—'}
            tone={health?.status === 'ok' ? 'green' : 'red'} />
          <StatCard label="Database" value={health?.db ?? '—'} tone={health?.db === 'up' ? 'green' : 'red'} />
          <StatCard label="Redis" value={health?.redis ?? '—'} tone={health?.redis === 'up' ? 'green' : 'red'} />
          <StatCard label="Terminal Status"
            value={t ? <StatusBadge status={t.computedStatus} /> : '—'}
            sub={t ? `heartbeat ${t.heartbeatAgeSeconds}s ago` : undefined}
            tone={t?.computedStatus === 'ONLINE' ? 'green' : t?.computedStatus === 'DEGRADED' ? 'yellow' : 'red'} />
        </div>

        {t && (
          <section className="rounded-lg border border-border p-4">
            <h2 className="font-semibold mb-3">Connected Terminal</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground">Terminal</dt><dd>{t.terminalName}</dd></div>
              <div><dt className="text-muted-foreground">Broker</dt><dd>{t.brokerName}</dd></div>
              <div><dt className="text-muted-foreground">Server</dt><dd>{t.serverName}</dd></div>
              <div><dt className="text-muted-foreground">Symbol Mapping</dt>
                <dd className="font-mono">{t.brokerSymbol} → {t.canonicalSymbol}</dd></div>
              <div><dt className="text-muted-foreground">Digits</dt><dd className="tabular-nums">{t.digits}</dd></div>
              <div><dt className="text-muted-foreground">Contract Size</dt>
                <dd className="tabular-nums">{Number(t.contractSize)}</dd></div>
              <div><dt className="text-muted-foreground">EA Version</dt><dd>{t.terminalBuild ? `build ${t.terminalBuild}` : '—'}</dd></div>
              <div><dt className="text-muted-foreground">Last Heartbeat</dt>
                <dd>{t.lastHeartbeatAt ? new Date(t.lastHeartbeatAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'never'}</dd></div>
            </dl>
          </section>
        )}

        {!t && (
          <p className="text-muted-foreground">
            No terminal registered. Attach MMXMBridgeEA to an XAUUSD chart in MT5.
          </p>
        )}
      </main>
    </>
  );
}
