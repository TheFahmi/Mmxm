import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaClient, Prisma } from '@mmxm/database';
import { REDIS } from '../../common/redis.module';
import type { CandleDto, TickDto } from './dto';

const CANDLE_STREAM = 'mmxm:stream:candles';
const TICK_STREAM = 'mmxm:stream:ticks';

@Injectable()
export class IngestionService {
  private readonly log = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async recordIngestion(eventId: string | null, endpoint: string, terminalDbId: string | null,
    status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED', rejectReason?: string) {
    await this.prisma.ingestionEvent.create({
      data: { eventId, endpoint, terminalDbId, status, rejectReason },
    }).catch(() => undefined); // never block pipeline on audit failure
  }

  /** Returns true if accepted (new), false if duplicate. */
  private async dedupe(eventId: string): Promise<boolean> {
    const key = `mmxm:dedupe:${eventId}`;
    const set = await this.redis.set(key, '1', 'EX', 86_400, 'NX');
    return set === 'OK';
  }

  async ingestTicks(terminalDbId: string, ticks: TickDto[]): Promise<{ accepted: number; duplicated: number }> {
    let accepted = 0, duplicated = 0;
    const fresh: TickDto[] = [];
    for (const t of ticks) {
      if (await this.dedupe(t.eventId)) { fresh.push(t); accepted++; }
      else duplicated++;
    }
    if (fresh.length) {
      await this.prisma.tick.createMany({
        data: fresh.map(t => ({
          eventId: t.eventId,
          terminalId: terminalDbId,
          brokerSymbol: t.brokerSymbol,
          canonicalSymbol: 'XAUUSD',
          brokerTsMs: BigInt(t.brokerTimestampMs),
          bid: new Prisma.Decimal(t.bid),
          ask: new Prisma.Decimal(t.ask),
          last: t.last != null ? new Prisma.Decimal(t.last) : null,
          volume: t.volume != null ? BigInt(Math.trunc(t.volume)) : null,
          volumeReal: t.volumeReal != null ? new Prisma.Decimal(t.volumeReal) : null,
          flags: t.flags,
          spreadPoints: t.spreadPoints,
          sequence: t.sequence,
        })),
        skipDuplicates: true,
      });
      // publish latest tick to stream for WS fanout (only the newest)
      const latest = fresh[fresh.length - 1]!;
      await this.redis.xadd(TICK_STREAM, 'MAXLEN', '~', 1000, '*',
        'payload', JSON.stringify(latest));
    }
    return { accepted, duplicated };
  }

  async ingestCandle(terminalDbId: string, c: CandleDto): Promise<'accepted' | 'duplicated' | 'revision'> {
    const unique = {
      terminalDbId_brokerSymbol_timeframe_openTime: {
        terminalDbId,
        brokerSymbol: c.brokerSymbol,
        timeframe: c.timeframe,
        openTime: new Date(c.openTime),
      },
    };
    const existing = await this.prisma.candle.findUnique({ where: unique });

    if (existing) {
      if (existing.isClosed && c.isClosed && existing.revision >= c.revision) {
        return 'duplicated';
      }
      if (existing.isClosed && c.isClosed && c.revision > existing.revision) {
        // broker correction — keep audit trail
        await this.prisma.$transaction([
          this.prisma.candleRevision.create({
            data: {
              candleId: existing.id,
              revision: c.revision,
              oldOhlc: { open: existing.open, high: existing.high, low: existing.low, close: existing.close },
              newOhlc: { open: c.open, high: c.high, low: c.low, close: c.close },
              reason: 'broker_correction',
            },
          }),
          this.prisma.candle.update({
            where: { id: existing.id },
            data: {
              open: c.open, high: c.high, low: c.low, close: c.close,
              tickVolume: BigInt(c.tickVolume), spread: c.spread, revision: c.revision,
            },
          }),
        ]);
        return 'revision';
      }
      // current candle update
      if (!existing.isClosed) {
        await this.prisma.candle.update({
          where: { id: existing.id },
          data: {
            open: c.open, high: c.high, low: c.low, close: c.close,
            tickVolume: BigInt(c.tickVolume), spread: c.spread, isClosed: c.isClosed,
          },
        });
        return 'accepted';
      }
      return 'duplicated';
    }

    const created = await this.prisma.candle.create({
      data: {
        terminalDbId,
        brokerSymbol: c.brokerSymbol,
        canonicalSymbol: 'XAUUSD',
        timeframe: c.timeframe,
        openTime: new Date(c.openTime),
        closeTime: new Date(c.closeTime),
        open: c.open, high: c.high, low: c.low, close: c.close,
        tickVolume: BigInt(c.tickVolume),
        realVolume: c.realVolume != null ? new Prisma.Decimal(c.realVolume) : null,
        spread: c.spread,
        isClosed: c.isClosed,
        revision: c.revision,
        source: 'MQL5',
      },
    });

    if (c.isClosed) {
      await this.redis.xadd(CANDLE_STREAM, 'MAXLEN', '~', 5000, '*',
        'payload', JSON.stringify({ ...c, candleId: created.id }));
    } else {
      await this.redis.publish('mmxm:pub:candle.current', JSON.stringify({ ...c, candleId: created.id }));
    }
    return 'accepted';
  }
}
