import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@mmxm/database';

@ApiTags('strategies')
@Controller('strategies')
export class StrategyController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async list() {
    const versions = await this.prisma.strategyVersion.findMany({
      orderBy: [{ strategyId: 'asc' }, { version: 'desc' }],
      include: { strategy: true },
    });
    return { success: true, data: versions };
  }
}
