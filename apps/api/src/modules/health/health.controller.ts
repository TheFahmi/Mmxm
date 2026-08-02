import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaClient } from '@mmxm/database';
import { REDIS } from '../../common/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async health() {
    const checks: Record<string, 'ok' | 'fail'> = { api: 'ok' };
    try { await this.prisma.$queryRaw`SELECT 1`; checks.postgres = 'ok'; }
    catch { checks.postgres = 'fail'; }
    try { await this.redis.ping(); checks.redis = 'ok'; }
    catch { checks.redis = 'fail'; }
    const ok = Object.values(checks).every(v => v === 'ok');
    return { success: ok, data: checks };
  }
}
