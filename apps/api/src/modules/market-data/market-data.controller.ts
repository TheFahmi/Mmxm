import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@mmxm/database';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod.pipe';

const candlesQuerySchema = z.object({
  timeframe: z.enum(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']).default('M5'),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  before: z.string().datetime().optional(),
});

@ApiTags('market-data')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get('candles')
  async candles(@Query(new ZodValidationPipe(candlesQuerySchema)) q: z.infer<typeof candlesQuerySchema>) {
    const where: Record<string, unknown> = { canonicalSymbol: 'XAUUSD', timeframe: q.timeframe };
    if (q.before) where['openTime'] = { lt: new Date(q.before) };
    const rows = await this.prisma.candle.findMany({
      where,
      orderBy: { openTime: 'desc' },
      take: q.limit,
    });
    // desc gives the LATEST N; reverse to ascending for chart display.
    // dedupe by openTime — keep latest revision (first-seen in desc order).
    const byTime = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = r.openTime.toISOString();
      if (!byTime.has(key)) byTime.set(key, r);
    }
    const data = [...byTime.values()].reverse().map(r => ({
      id: r.id,
      canonicalSymbol: r.canonicalSymbol,
      timeframe: r.timeframe,
      openTime: r.openTime,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      tickVolume: Number(r.tickVolume),
      realVolume: r.realVolume != null ? Number(r.realVolume) : null,
      spread: Number(r.spread),
      revision: Number(r.revision),
      receivedAt: r.receivedAt,
    }));
    return { success: true, data };
  }

  @Get('ticks/latest')
  async latestTick() {
    const t = await this.prisma.tick.findFirst({
      where: { canonicalSymbol: 'XAUUSD' },
      orderBy: { brokerTsMs: 'desc' },
    });
    if (!t) return { success: true, data: null };
    return {
      success: true,
      data: {
        bid: Number(t.bid),
        ask: Number(t.ask),
        spreadPoints: t.spreadPoints,
        brokerTimestampMs: Number(t.brokerTsMs),
        receivedAt: t.receivedAt.toISOString(),
      },
    };
  }
}
