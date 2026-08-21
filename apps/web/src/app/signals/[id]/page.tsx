'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge, StatCard } from '@/components/ui';

interface SignalDetail {
  id: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  mmxmModel: string;
  confidence: number;
  entryMin: string;
  entryMax: string;
  preferredEntry: string;
  stopLoss: string;
  riskReward: string;
  htfBias: string;
  aiInsight: {
    verdict: 'AGREE' | 'DISAGREE' | 'NEUTRAL';
    summary: string;
    keyLevels: string[];
    risks: string[];
    suggestion: string;
  } | null;
  aiVerified: boolean;
  setupTf: string;
  confirmationTf: string;
  takeProfits: { level: number; price: number; allocationPercentage: number; liquidityTarget?: string }[];
  invalidationRules: { type: string; description: string; priceLevel?: number | null; timeframe?: string | null }[];
  reasons: { code: string; description: string; weight: string; evidenceCandleIds: string[] }[];
  events: { id: string; fromStatus: string; toStatus: string; payload?: { level?: number } | null; createdAt: string }[];
  notifications: { id: string; channel: string; status: string; error: string | null; createdAt: string }[];
  detectedAt: string;
  confirmedAt: string | null;
  expiresAt: string;
}

export default function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: s, isLoading, error } = useQuery({
    queryKey: ['signal', id],
    queryFn: () => apiGet<SignalDetail>(`/signals/${id}`),
    refetchInterval: 15_000,
  });

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-bearish">Failed to load signal.</p>}
        {s && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={`text-xl font-bold ${s.direction === 'LONG' ? 'text-bullish' : 'text-bearish'}`}>
                {s.direction} XAUUSD
              </h1>
              <StatusBadge status={s.status} />
              <span className="text-muted-foreground text-sm">
                {s.mmxmModel === 'MARKET_MAKER_BUY_MODEL' ? 'Market Maker Buy Model' : 'Market Maker Sell Model'}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                bias {s.htfBias} · setup {s.setupTf} · confirm {s.confirmationTf}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Preferred Entry" value={Number(s.preferredEntry).toFixed(2)}
                sub={`zone ${Number(s.entryMin).toFixed(2)} — ${Number(s.entryMax).toFixed(2)}`} />
              <StatCard label="Stop Loss" value={Number(s.stopLoss).toFixed(2)} />
              <StatCard label="Risk:Reward" value={`1 : ${Number(s.riskReward).toFixed(2)}`} />
              <StatCard label="Confidence" value={s.confidence}
                tone={s.confidence >= 80 ? 'green' : s.confidence >= 65 ? 'yellow' : 'default'} />
            </div>

            <section className="rounded-lg border border-border p-4">
              <h2 className="font-semibold mb-2">Take Profits</h2>
              <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
                <thead className="text-muted-foreground text-left">
                  <tr><th className="py-1">TP</th><th>Price</th><th>Alloc</th><th>Liquidity Target</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {s.takeProfits.map(tp => {
                    // Derive hit TPs from lifecycle events; TP3 emits COMPLETED (payload.level=3), not TP3_HIT
                    const hitEvents = s.events.filter(e => e.toStatus.startsWith('TP') && e.toStatus.endsWith('_HIT'));
                    const hitLevels = hitEvents.map(e => Number(e.toStatus.match(/TP(\d+)_HIT/)?.[1] ?? '0'));
                    const completed = s.events.find(e => e.toStatus === 'COMPLETED');
                    const completedLevel = completed ? Number(completed.payload?.level ?? 0) : 0;
                    const hit = hitLevels.includes(tp.level) || (completedLevel >= tp.level);
                    return (
                    <tr key={tp.level} className="border-t border-border tabular-nums">
                      <td className="py-1">TP{tp.level}</td>
                      <td>{Number(tp.price).toFixed(2)}</td>
                      <td>{tp.allocationPercentage}%</td>
                      <td className="text-muted-foreground">{tp.liquidityTarget ?? '—'}</td>
                      <td>
                        {hit ? (
                          <span className="inline-flex items-center gap-1 text-bullish">
                            <span className="material-symbols-outlined text-[15px]">check_circle</span> Hit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <span className="material-symbols-outlined text-[15px]">radio_button_unchecked</span> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="font-semibold mb-3">Reasons ({s.reasons.length})</h2>
              <ul className="space-y-1.5">
                {s.reasons.map((r, i) => (
                  <li key={i} className="rounded-md bg-muted/40 border border-border/60 px-3 py-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-medium tracking-wide text-muted-foreground">{r.code}</span>
                      <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">+{Number(r.weight)}</span>
                    </div>
                    <div className="text-xs leading-relaxed text-foreground">{r.description}</div>
                  </li>
                ))}
              </ul>
            </section>

            {s.aiInsight && (
              <section className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="font-semibold">AI Insight (MMAI v1)</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.aiInsight.verdict === 'AGREE' ? 'bg-green-500/10 text-green-600' :
                    s.aiInsight.verdict === 'DISAGREE' ? 'bg-red-500/10 text-red-600' :
                    'bg-yellow-500/10 text-yellow-600'
                  }`}>
                    {s.aiInsight.verdict}
                  </span>
                </div>
                <p className="text-sm mb-3">{s.aiInsight.summary}</p>
                {s.aiInsight.keyLevels?.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-muted-foreground font-medium">Key levels: </span>
                    <span className="text-sm tabular-nums">{s.aiInsight.keyLevels.join(' · ')}</span>
                  </div>
                )}
                {s.aiInsight.risks?.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-muted-foreground font-medium">Risks: </span>
                    <ul className="text-sm list-disc list-inside space-y-0.5">
                      {s.aiInsight.risks.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {s.aiInsight.suggestion && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <span className="font-medium text-foreground">Suggestion: </span>{s.aiInsight.suggestion}
                  </p>
                )}
              </section>
            )}

            <section className="rounded-lg border border-border p-4">
              <h2 className="font-semibold mb-2">Invalidation Rules</h2>
              <ul className="space-y-1 text-sm list-disc list-inside">
                {s.invalidationRules.map((r, i) => (
                  <li key={i}>
                    {r.description}
                    {r.priceLevel != null && <span className="tabular-nums text-muted-foreground"> @ {Number(r.priceLevel).toFixed(2)}</span>}
                    {r.timeframe && <span className="text-muted-foreground"> ({r.timeframe})</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="font-semibold mb-2">Lifecycle</h2>
              <ul className="space-y-1 text-sm">
                {s.events.map(e => (
                  <li key={e.id} className="flex gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(e.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    </span>
                    <span className="text-muted-foreground">{e.fromStatus} →</span>
                    <StatusBadge status={e.toStatus} />
                  </li>
                ))}
              </ul>
              {s.notifications.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  notifications: {s.notifications.map(n => `${n.channel}:${n.status}`).join(', ')}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                detected {new Date(s.detectedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                {s.confirmedAt && ` · confirmed ${new Date(s.confirmedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`}
                {` · expires ${new Date(s.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`}
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
