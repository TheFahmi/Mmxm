export function StatCard({ label, value, sub, tone }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'green' | 'red' | 'yellow' | 'default';
}) {
  const toneCls = tone === 'green' ? 'text-bullish' : tone === 'red' ? 'text-bearish' : tone === 'yellow' ? 'text-yellow-500' : '';
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'ONLINE' || status === 'CONFIRMED' || status === 'ACTIVE' || status === 'COMPLETED'
      ? 'bg-bullish/15 text-bullish border-bullish/30'
      : status === 'DEGRADED' || status === 'PRELIMINARY' || status === 'WATCHING'
        ? 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30'
        : 'bg-bearish/15 text-bearish border-bearish/30';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
