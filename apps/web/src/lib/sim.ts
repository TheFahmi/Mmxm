// Shared trade sizing/compound logic for simulasi + signals pages.
// XAUUSD: 1 lot = $100 per point. Lot = min(risk$ / (SL_dist * 100), maxLot).
export interface SimSignal {
  id: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  preferredEntry: string;
  detectedAt: string;
  takeProfits: { level: number; price: number }[];
  stopLoss: string;
}

export interface SimRow {
  s: SimSignal;
  r: number;
  slDist: number;
  lot: number;
  pnl: number;
  eqAfter: number;
}

export function computeSim(
  items: SimSignal[],
  { deposit, riskPct, maxLot }: { deposit: number; riskPct: number; maxLot: number },
) {
  const CLOSED = ['COMPLETED', 'TP1_HIT', 'TP2_HIT', 'FAILED', 'STOPPED'];
  // urut kronologis
  const trades = [...items].reverse().map(s => {
    const entry = Number(s.preferredEntry), sl = Number(s.stopLoss);
    const slDist = Math.abs(entry - sl);
    if (slDist === 0) return { s, r: 0, slDist: 0 };
    const win = s.status !== 'FAILED' && s.status !== 'STOPPED';
    let r = -1;
    if (win) {
      const tpIdx = s.status === 'TP2_HIT' ? 1 : 0;
      const tp = s.takeProfits?.[tpIdx]?.price;
      r = tp != null ? Math.abs(Number(tp) - entry) / slDist : 0;
    }
    return { s, r, slDist };
  });
  let eq = deposit;
  const rows: SimRow[] = trades.map(tr => {
    const riskDollar = eq * (riskPct / 100);
    const idealLot = tr.slDist > 0 ? riskDollar / (tr.slDist * 100) : 0;
    const lot = Math.min(idealLot, maxLot);
    const closed = CLOSED.includes(tr.s.status);
    const pnl = closed ? lot * tr.slDist * 100 * tr.r : 0;
    eq += pnl;
    return { ...tr, lot, pnl, eqAfter: eq };
  });
  const wins = rows.filter(x => x.r > 0).length;
  return {
    rows,
    n: rows.length,
    wins,
    final: eq,
    sumR: rows.reduce((a, x) => a + x.r, 0),
    lotCapped: rows.filter(x => x.slDist > 0 && x.lot >= maxLot && x.lot > 0).length,
  };
}
