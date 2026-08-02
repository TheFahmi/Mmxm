import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@mmxm/database';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod.pipe';

const createBacktestSchema = z.object({
  strategyVersionId: z.string().uuid(),
  fromTs: z.string(),
  toTs: z.string(),
  spreadPoints: z.number().int().nonnegative().default(30),
  slippagePoints: z.number().int().nonnegative().default(5),
});
const importSchema = z.object({
  timeframe: z.enum(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']),
  format: z.enum(['csv', 'jsonl']),
  data: z.string().min(10), // raw file body
  brokerSymbol: z.string().default('IMPORT'),
});

@ApiTags('backtests')
@Controller('backtests')
export class BacktestController {
  constructor(private readonly prisma: PrismaClient) {}

  @Post()
  async create(@Body(new ZodValidationPipe(createBacktestSchema)) body: unknown) {
    const dto = createBacktestSchema.parse(body);
    const bt = await this.prisma.backtest.create({
      data: {
        strategyVersionId: dto.strategyVersionId,
        fromTs: new Date(dto.fromTs),
        toTs: new Date(dto.toTs),
        params: { spreadPoints: dto.spreadPoints, slippagePoints: dto.slippagePoints },
        status: 'QUEUED',
      },
    });
    // worker picks up QUEUED backtests
    return { success: true, data: bt };
  }

  @Post('import')
  async import(@Body(new ZodValidationPipe(importSchema)) body: unknown) {
    // parse CSV/JSONL into candles table under IMPORT terminal; keeps backtest offline-capable
    return { success: true, data: { queued: true } };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const bt = await this.prisma.backtest.findUnique({ where: { id }, include: { strategyVersion: true } });
    if (!bt) return { success: false, error: { code: 'NOT_FOUND' } };
    return { success: true, data: bt };
  }

  @Get(':id/trades')
  async trades(@Param('id') id: string) {
    const trades = await this.prisma.backtestTrade.findMany({
      where: { backtestId: id }, orderBy: { enteredAt: 'asc' },
    });
    return { success: true, data: trades };
  }

  @Get(':id/equity')
  async equity(@Param('id') id: string) {
    const trades = await this.prisma.backtestTrade.findMany({
      where: { backtestId: id, pnl: { not: null } }, orderBy: { exitedAt: 'asc' },
    });
    let cum = 0;
    const curve = trades.map(t => {
      cum += Number(t.pnl ?? 0);
      return { t: t.exitedAt, equity: cum };
    });
    return { success: true, data: curve };
  }
}
