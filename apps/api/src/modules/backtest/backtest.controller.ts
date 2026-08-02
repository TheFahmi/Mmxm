import { Body, Controller, Get, Param, Post, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@mmxm/database';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { REDIS } from '../../common/redis.module';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
});

@ApiTags('backtests')
@Controller('backtests')
export class BacktestController {
  private queue: Queue;

  constructor(
    private readonly prisma: PrismaClient,
    @Inject(REDIS) redis: Redis,
  ) {
    this.queue = new Queue('mmxm-backtest', { connection: redis as never });
  }

  @Get()
  async list() {
    const items = await this.prisma.backtest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { trades: true } } },
    });
    return { success: true, data: items };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const bt = await this.prisma.backtest.findUnique({
      where: { id },
      include: { trades: { orderBy: { enteredAt: 'asc' } } },
    });
    if (!bt) return { success: false, error: { code: 'NOT_FOUND' } };
    return { success: true, data: bt };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    const version = await this.prisma.strategyVersion.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!version) {
      return { success: false, error: { code: 'NO_ACTIVE_STRATEGY', message: 'Seed a strategy version first' } };
    }
    const bt = await this.prisma.backtest.create({
      data: {
        strategyVersionId: version.id,
        fromTs: new Date(body.rangeStart),
        toTs: new Date(body.rangeEnd),
        params: { name: body.name },
        status: 'QUEUED',
      },
    });
    await this.queue.add('run', { backtestId: bt.id }, {
      jobId: `bt-${bt.id}`,
      removeOnComplete: 50,
      attempts: 1,
    });
    return { success: true, data: bt };
  }
}
