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
      orderBy: { openTime: 'asc' },
      take: q.limit,
    });
    // dedupe by openTime (highest revision last in asc order) — keep latest revision
    const byTime = new Map<string, (typeof rows)[number]>();
    for (const r of rows) byTime.set(r.openTime.toISOString(), r);
    return [...byTime.values()];
  }

  @Get('ticks/latest')
  async latestTick() {
    return this.prisma.tick.findFirst({
      where: { canonicalSymbol: 'XAUUSD' },
      orderBy: { brokerTsMs: 'desc' },
    });
  }
}
