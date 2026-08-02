'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';

interface StrategyVersion {
  id: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  config: Record<string, unknown>;
  strategy: { name: string; description: string | null };
}

export default function StrategyPage() {
  const { data } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => apiGet<StrategyVersion[]>('/strategies'),
  });

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-semibold">Strategy Config</h1>
        {(data ?? []).map(v => (
          <section key={v.id} className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold">{v.strategy.name} — v{v.version}</h2>
              <StatusBadge status={v.isActive ? 'ACTIVE' : 'INACTIVE'} />
              <span className="text-xs text-muted-foreground">
                created {new Date(v.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}
              </span>
            </div>
            <pre className="text-xs bg-muted/60 rounded p-3 overflow-x-auto">
              {JSON.stringify(v.config, null, 2)}
            </pre>
          </section>
        ))}
        {data?.length === 0 && (
          <p className="text-muted-foreground">No strategy configured. Run seed to create default MMXM v1.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Config editing is read-only in UI; changes go through DB + new version row (audit trail).
        </p>
      </main>
    </>
  );
}
