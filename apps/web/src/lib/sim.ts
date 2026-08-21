// Shared trade sizing/compound logic for simulasi + signals pages.
// XAUUSD: 1 lot = $100 per point. Lot = min(risk$ / (SL_dist * 100), maxLot).
// R real berbasis partial close 25/25/50 + AUTO-BE setelah TP1:
//   TPx_HIT  = TP kena lalu sisa kena SL AWAL -> TP1: +0.25R1 − 0.75; TP2: +0.25R1 +0.25R2 − 0.5
//   STOPPED  = BE/trailing kena setelah TP -> profit terkunci (TP1+STOP: +0.25R1; TP2+STOP: +0.25R1+0.25R2)
//   COMPLETED= 0.25R1 + 0.25R2 + 0.5R3
//   FAILED   = SL awal tanpa TP -> −1R
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
    const tpPrices = (s.takeProfits ?? []).map(t => Number(t.price)).filter(Number.isFinite);
    const d = slDist;
    const R = (i: number) => Math.abs(tpPrices[i] - entry) / d;
    let r: number;
    if (s.status === 'COMPLETED' && tpPrices.length >= 3) {
      r = 0.25 * R(0) + 0.25 * R(1) + 0.5 * R(2);
    } else if (s.status === 'COMPLETED') {
      const last = tpPrices[tpPrices.length - 1] ?? entry;
      r = Math.abs(last - entry) / d;
    } else if (s.status === 'STOPPED' && tpPrices.length >= 2) {
      r = 0.25 * R(0) + 0.25 * R(1); // TP1+TP2 terkunci, sisa close BE = 0
    } else if (s.status === 'STOPPED' && tpPrices.length >= 1) {
      r = 0.25 * R(0); // TP1 terkunci, sisa close BE = 0
    } else if (s.status === 'TP2_HIT' && tpPrices.length >= 2) {
      r = 0.25 * R(0) + 0.25 * R(1) - 0.5;
    } else if (s.status === 'TP1_HIT' && tpPrices.length >= 1) {
      r = 0.25 * R(0) - 0.75;
    } else if (s.status === 'FAILED' || s.status === 'STOPPED') {
      r = -1; // STOPPED tanpa TP (legacy/edge)
    } else {
      r = 0;
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
