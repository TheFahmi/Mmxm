'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Nav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const EquityChart = dynamic(() => import('@/components/equity-chart'), { ssr: false, loading: () => <div className="h-56 animate-pulse bg-muted/40 rounded-lg" /> });

interface SignalRow {
  id: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  preferredEntry: string;
  confidence: number;
  detectedAt: string;
  aiInsight: { verdict: 'AGREE' | 'DISAGREE' | 'NEUTRAL' } | null;
  takeProfits: { level: number; price: number }[];
  stopLoss: string;
}

type SignalListResponse = { items: SignalRow[]; total?: number };

const STATUSES = ['', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE', 'TP1_HIT', 'TP2_HIT', 'COMPLETED', 'FAILED', 'STOPPED', 'INVALIDATED', 'EXPIRED'];
const VERDICTS = ['', 'AGREE', 'DISAGREE', 'NEUTRAL'];
const CONFIDENCE = [
  { label: 'Semua', min: 0 },
  { label: '≥65', min: 65 },
  { label: '≥75', min: 75 },
  { label: '≥85', min: 85 },
  { label: '≥90', min: 90 },
];

export default function SimulasiPage() {
  const [deposit, setDeposit] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);
  const [maxLot, setMaxLot] = useState(1);
  const [fixedMode, setFixedMode] = useState(false);
  const [fixedLot, setFixedLot] = useState(0.01);
  const [status, setStatus] = useState('CLOSED');
  const [verdict, setVerdict] = useState('');
  const [confIdx, setConfIdx] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortKey, setSortKey] = useState('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useQuery<SignalListResponse>({
    queryKey: ['signals', 'sim', status, verdict, confIdx],
    queryFn: async () => {
      // ponytail: loop semua halaman (limit 200/request) — ganti ke endpoint khusus kalau >2k sinyal
      const params = new URLSearchParams({ limit: '200', offset: '0' });
      if (status === 'CLOSED') {
        // multi-status: fetch semua, filter client-side (API belum support status IN)
        const first = await apiGet<SignalListResponse>(`/signals?${params}`);
        const items = [...first.items];
        while (items.length < (first.total ?? 0)) {
          const next = await apiGet<SignalListResponse>(`/signals?limit=200&offset=${items.length}`);
          if (!next.items?.length) break;
          items.push(...next.items);
        }
        const CLOSED = ['COMPLETED', 'TP1_HIT', 'TP2_HIT', 'FAILED', 'STOPPED'];
        const minConf = CONFIDENCE[confIdx]?.min ?? 0;
        const filtered = items.filter(s =>
          CLOSED.includes(s.status)
          && (!verdict || s.aiInsight?.verdict === verdict)
          && s.confidence >= minConf
        );
        return { items: filtered, total: filtered.length };
      }
      if (status) params.set('status', status);
      if (verdict) params.set('verdict', verdict);
      if (CONFIDENCE[confIdx]?.min) params.set('minConf', String(CONFIDENCE[confIdx].min));
      const qs = params.toString();
      const first = await apiGet<SignalListResponse>(`/signals?${qs}`);
      const items = [...first.items];
      while (items.length < (first.total ?? 0)) {
        const next = await apiGet<SignalListResponse>(`/signals?limit=200&offset=${items.length}&${qs}`);
        if (!next.items?.length) break;
        items.push(...next.items);
      }
      return { items, total: items.length };
    },
    refetchInterval: 60_000,
  });

  const sim = useMemo(() => {
    if (!data?.items) return null;
    // filter tanggal dulu (client-side) — sim dihitung dari periode terpilih
    let items = data.items;
    if (fromDate) items = items.filter(s => s.detectedAt.slice(0, 10) >= fromDate);
    if (toDate) items = items.filter(s => s.detectedAt.slice(0, 10) <= toDate);
    // urut kronologis, compound; lot = min(risk-based, maxLot); XAUUSD 1 lot = $100/point
    const trades = [...items].reverse().map(s => {
      const entry = Number(s.preferredEntry), sl = Number(s.stopLoss);
      const slDist = Math.abs(entry - sl);
      if (slDist === 0) return { s, r: 0, slDist: 0 };
      // R real berbasis partial close 25/25/50:
      //   TPx_HIT  = TP itu kena lalu sisa posisi balik ke SL
      //     -> R = w1*(tp1-e)/d + (sisa)*(−1)  [TP1: +0.25R1 − 0.75; TP2: +0.25R1 +0.25R2 − 0.5]
      //   COMPLETED= semua TP kena -> R = 0.25R1 + 0.25R2 + 0.5R3
      //   FAILED   = SL langsung, belum pernah TP -> −1R
      //   STOPPED  = SL sebelum TP manapun -> −1R
      const tpPrices = (s.takeProfits ?? []).map(t => Number(t.price)).filter(Number.isFinite);
      const d = slDist;
      const R = (i: number) => Math.abs(tpPrices[i] - entry) / d;
      let r: number;
      if (s.status === 'COMPLETED' && tpPrices.length >= 3) {
        r = 0.25 * R(0) + 0.25 * R(1) + 0.5 * R(2);
      } else if (s.status === 'COMPLETED') {
        // COMPLETED tanpa 3 TP lengkap: pakai TP tertinggi yang ada sebagai full close
        const last = tpPrices[tpPrices.length - 1] ?? entry;
        r = Math.abs(last - entry) / d;
      } else if (s.status === 'TP2_HIT' && tpPrices.length >= 2) {
        r = 0.25 * R(0) + 0.25 * R(1) - 0.5;
      } else if (s.status === 'TP1_HIT' && tpPrices.length >= 1) {
        r = 0.25 * R(0) - 0.75;
      } else if (s.status === 'FAILED' || s.status === 'STOPPED') {
        r = -1;
      } else {
        r = 0;
      }
      return { s, r, slDist };
    });
    let eq = deposit;
    const rows = trades.map(tr => {
      const lot = fixedMode
        ? Math.max(0.01, fixedLot)
        : Math.min(tr.slDist > 0 ? (eq * (riskPct / 100)) / (tr.slDist * 100) : 0, maxLot);
      const pnl = lot * tr.slDist * 100 * tr.r;
      eq += pnl;
      return { ...tr, lot, pnl, eqAfter: eq };
    });
    // W/L: win = R > 0 (TPx_HIT dengan partial profit tetap bisa win/lose sesuai net R)
    const wins = rows.filter(x => x.r > 0).length;
    const lotCapped = fixedMode
      ? 0
      : rows.filter(x => x.slDist > 0 && x.lot >= maxLot && x.lot > 0).length;

    // Drawdown: peak-to-trough dari equity berjalan
    let peak = deposit;
    let maxDD = 0;
    let maxDDPct = 0;
    let currentDD = 0;
    let currentDDPct = 0;
    for (const row of rows) {
      if (row.eqAfter > peak) peak = row.eqAfter;
      const dd = peak - row.eqAfter;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
      currentDD = dd;
      currentDDPct = ddPct;
    }

    // Equity points untuk chart (kronologis)
    const equityPoints = rows.map(row => ({
      time: row.s.detectedAt,
      value: row.eqAfter,
    }));

    return {
      rows, n: rows.length, wins, final: eq, sumR: rows.reduce((a, x) => a + x.r, 0), lotCapped,
      maxDD, maxDDPct, currentDD, currentDDPct, equityPoints,
    };
  }, [data, deposit, riskPct, maxLot, fixedMode, fixedLot, fromDate, toDate]);

  // Sort (client-side, hanya tampilan tabel — sim tidak terpengaruh)
  const visibleRows = useMemo(() => {
    if (!sim) return [];
    const rows = [...sim.rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'lot': return (a.lot - b.lot) * dir;
        case 'r': return (a.r - b.r) * dir;
        case 'pnl': return (a.pnl - b.pnl) * dir;
        case 'equity': return (a.eqAfter - b.eqAfter) * dir;
        default: return (new Date(a.s.detectedAt).getTime() - new Date(b.s.detectedAt).getTime()) * dir;
      }
    });
    return rows;
  }, [sim, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const profit = sim ? sim.final - deposit : 0;

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-semibold">Simulasi Equity</h1>
          <span className="text-xs text-muted-foreground">{sim ? `${sim.n} trade closed` : ''} · bukan financial advice</span>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Status</span>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              <option value="CLOSED">Closed saja</option>
              {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
              <option value="">Semua</option>
            </select>
          </label>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">AI Verdict</span>
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {VERDICTS.map(v => (
                <button
                  key={v}
                  onClick={() => setVerdict(v)}
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
                  onClick={() => setConfIdx(i)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    confIdx === i ? 'bg-amber-500 text-black font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Dari</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm" />
            <span className="whitespace-nowrap">Sampai</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm" />
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-xs text-amber-500 hover:underline">Reset</button>
            )}
          </div>
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="mb-0 self-end">Sizing</div>
              <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                {[['Dinamis', false], ['Fixed lot', true]].map(([label, val]) => (
                  <button
                    key={String(label)}
                    onClick={() => setFixedMode(val as boolean)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      fixedMode === val ? 'bg-amber-500 text-black font-semibold' : 'hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {fixedMode ? (
              <label className="text-xs text-muted-foreground">
                <div className="mb-1">Lot (fixed)</div>
                <input type="number" min={0.01} step={0.01} value={fixedLot} onChange={e => setFixedLot(Math.max(0.01, Number(e.target.value) || 0.01))}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground tabular-nums" />
              </label>
            ) : (
              <label className="text-xs text-muted-foreground">
                <div className="mb-1">Max lot</div>
                <input type="number" min={0.01} step={0.01} value={maxLot} onChange={e => setMaxLot(Math.max(0.01, Number(e.target.value) || 0.01))}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground tabular-nums" />
              </label>
            )}
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
              {sim.lotCapped > 0 && <span className="text-amber-500">{sim.lotCapped} trade lot capped</span>}
              <span className="text-bearish">Max DD ${sim.maxDD.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({sim.maxDDPct.toFixed(1)}%)</span>
              {sim.currentDD > 0 && (
                <span className="text-bearish/70">DD sekarang ${sim.currentDD.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({sim.currentDDPct.toFixed(1)}%)</span>
              )}
            </div>
          )}
        </div>

        {sim && sim.equityPoints.length > 1 && (
          <EquityChart points={sim.equityPoints} baseline={deposit} />
        )}

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2"><button onClick={() => toggleSort('time')} className="hover:text-foreground">Time {sortKey === 'time' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2"><button onClick={() => toggleSort('lot')} className="hover:text-foreground">Lot {sortKey === 'lot' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                <th className="text-right px-3 py-2"><button onClick={() => toggleSort('r')} className="hover:text-foreground">R {sortKey === 'r' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                <th className="text-right px-3 py-2"><button onClick={() => toggleSort('pnl')} className="hover:text-foreground">P/L {sortKey === 'pnl' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                <th className="text-right px-3 py-2"><button onClick={() => toggleSort('equity')} className="hover:text-foreground">Equity {sortKey === 'equity' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={`${row.s.id}-${i}`} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/signals/${row.s.id}`} className="hover:underline">
                      {new Date(row.s.detectedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 font-medium ${row.s.direction === 'LONG' ? 'text-bullish' : 'text-bearish'}`}>{row.s.direction}</td>
                  <td className="px-3 py-2"><StatusBadge status={row.s.status} /></td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.lot >= maxLot && row.lot > 0 ? 'text-amber-500 font-medium' : ''}`}>{row.lot.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.r >= 0 ? 'text-bullish' : 'text-bearish'}`}>{row.r >= 0 ? '+' : ''}{row.r.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.pnl >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                    {row.pnl >= 0 ? '+' : '-'}${Math.abs(row.pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">${row.eqAfter.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {isLoading && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">Memuat…</td></tr>
              )}
              {sim && sim.n === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">Belum ada sinyal sesuai filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
