import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient, SignalStatus } from '@mmxm/database';

@ApiTags('signals')
@Controller('signals')
export class SignalController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async list(
    @Query('status') status?: SignalStatus,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const take = Math.min(parseInt(limit, 10) || 50, 200);
    const skip = parseInt(offset, 10) || 0;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.signal.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        take, skip,
        include: { reasons: true },
      }),
      this.prisma.signal.count({ where }),
    ]);
    return { success: true, data: { items, total, take, skip } };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const signal = await this.prisma.signal.findUnique({
      where: { id },
      include: {
        reasons: true,
        events: { orderBy: { createdAt: 'asc' } },
        notifications: { orderBy: { createdAt: 'desc' } },
        strategyVersion: { include: { strategy: true } },
      },
    });
    if (!signal) return { success: false, error: { code: 'NOT_FOUND' } };
    return { success: true, data: signal };
  }
}
