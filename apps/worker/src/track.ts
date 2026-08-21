import { PrismaClient, SignalStatus } from '@mmxm/database';
import { logger } from './logger.js';

type Publish = (event: string, data: unknown) => void;

interface TpLevel { level?: number; price: string | number }

const PRE_ENTRY: SignalStatus[] = ['WATCHING', 'PRELIMINARY', 'CONFIRMED'];
const TRACKED: SignalStatus[] = [...PRE_ENTRY, 'ACTIVE', 'TP1_HIT', 'TP2_HIT'];

/**
 * Signal lifecycle (monotonic), evaluated against the LATEST TICK every second.
 * Price = ticks.last (fallback bid). Tick-driven, not candle: reacts within ~1s
 * of a level being touched — no M1-close latency, no missed wicks.
 */
export async function trackSignalOutcomes(prisma: PrismaClient, publish: Publish): Promise<void> {
  const open = await prisma.signal.findMany({
    where: { canonicalSymbol: 'XAUUSD', status: { in: TRACKED } },
  });
  if (!open.length) return;

  const tick = await prisma.tick.findFirst({
    where: { canonicalSymbol: 'XAUUSD' },
    orderBy: { brokerTsMs: 'desc' },
  });
  if (!tick) return;

  const last = Number(tick.last);
  // 'last' defaults to 0.00000000 in DB (non-null Decimal). Only trust if > 0.
  const price = last > 0 ? last : Number(tick.bid);
  const now = new Date();

  for (const s of open) {
    const long = s.direction === 'LONG';
    const sl = Number(s.stopLoss);
    const entryMin = Number(s.entryMin);
    const entryMax = Number(s.entryMax);
    const tps = ((s.takeProfits as unknown as TpLevel[]) ?? [])
      .map((t, i) => ({ level: t.level ?? i + 1, price: Number(t.price) }))
      .filter(t => Number.isFinite(t.price))
      .sort((a, b) => a.level - b.level);

    let curStatus: string = s.status as string;
    const transition = async (to: string, eventName: string, payload: Record<string, unknown>) => {
      const fromStatus = curStatus;
      await prisma.signal.update({
        where: { id: s.id },
        data: {
          status: to as never,
          events: { create: { fromStatus, toStatus: to, payload: { ...payload, price, at: now.toISOString() } as never } },
        },
      });
      publish(eventName, { id: s.id, status: to, price });
      logger.info({ id: s.id, price, to, fromStatus }, `signal ${to}`);
      curStatus = to;
    };

    // EXPIRED: past expiry, still pre-entry
    if (PRE_ENTRY.includes(s.status) && s.expiresAt < now) {
      await transition('EXPIRED', 'xauusd.signal.closed', { reason: 'expiresAt passed' });
      continue;
    }

    const inEntryZone = price >= Math.min(entryMin, entryMax) && price <= Math.max(entryMin, entryMax);
    const slHit = long ? price <= sl : price >= sl;

    // ACTIVE: hanya jika harga BENAR-BENAR masuk entry zone.
    // Tidak ada jalur "crossedEntry" — harga yang sudah lewat zone tanpa menyentuhnya
    // berarti sinyal stale (harga lari sebelum sinyal terbit) -> INVALIDATED, bukan entry palsu.
    if (PRE_ENTRY.includes(s.status) && inEntryZone) {
      await transition('ACTIVE', 'xauusd.signal.active', { confirmedAt: s.confirmedAt });
      continue;
    }

    // INVALIDATED: pre-entry, tick broke through SL — setup dead without entry
    if (PRE_ENTRY.includes(s.status) && slHit) {
      await transition('INVALIDATED', 'xauusd.signal.closed', { reason: 'SL broken before entry' });
      continue;
    }

    // post-entry SL hit -> FAILED (ACTIVE) or STOPPED (after TP hit)
    // Kena SL harus stop — jangan biarkan TP1_HIT/TP2_HIT nge-block sinyal baru
    if (s.status === 'ACTIVE' && slHit) {
      await transition('FAILED', 'xauusd.signal.closed', { reason: 'SL hit' });
      continue;
    }
    // TP1_HIT/TP2_HIT yang kena SL biarkan stay TPx_HIT (partial profit) — jangan STOPPED
    // Kalau mau stop, cuma untuk yang belum TP sama sekali

    // TP progression
    if (['ACTIVE', 'TP1_HIT', 'TP2_HIT'].includes(s.status)) {
      const hit = tps.filter(t => (long ? price >= t.price : price <= t.price));
      const maxLevel = hit.length ? Math.max(...hit.map(t => t.level)) : 0;
      const currentLevel = s.status === 'ACTIVE' ? 0 : s.status === 'TP1_HIT' ? 1 : s.status === 'TP2_HIT' ? 2 : 3;
      
      // Emit each newly-hit TP level (not just highest). TP3 -> COMPLETED
      // Use while-loop so all levels between currentLevel+1 and maxLevel emit,
      // including backfill when multiple were skipped.
      let level = currentLevel + 1;
      while (level <= maxLevel) {
        const to = level >= 3 ? 'COMPLETED' : `TP${level}_HIT`;
        await transition(to, 'xauusd.signal.tp', { level, price: hit.find(t => t.level === level)?.price });
        level++;
      }
    }
  }
}
