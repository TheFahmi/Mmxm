import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@mmxm/database';

@ApiTags('mql5-terminal')
@Controller('terminals')
export class Mql5TerminalController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async list() {
    const terminals = await this.prisma.mql5Terminal.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { candles: true, heartbeats: true } } },
    });
    // recompute status based on heartbeat age
    const now = Date.now();
    return {
      success: true,
      data: terminals.map(t => {
        const ageSec = t.lastHeartbeatAt ? (now - t.lastHeartbeatAt.getTime()) / 1000 : Infinity;
        const status = ageSec < 15 ? 'ONLINE' : ageSec <= 30 ? 'DEGRADED' : 'OFFLINE';
        const meta: Record<string, unknown> = (t.symbolMetadata as Record<string, unknown>) ?? {};
        return {
          ...t,
          computedStatus: status,
          heartbeatAgeSeconds: ageSec,
          digits: meta.digits ?? null,
          point: meta.point ?? null,
          tickSize: meta.tickSize ?? null,
          tickValue: meta.tickValue ?? null,
          contractSize: meta.contractSize ?? null,
          minimumVolume: meta.minimumVolume ?? null,
          maximumVolume: meta.maximumVolume ?? null,
          volumeStep: meta.volumeStep ?? null,
        };
      }),
    };
  }

  @Get(':id/heartbeats')
  async heartbeats(@Param('id') id: string) {
    const rows = await this.prisma.mql5Heartbeat.findMany({
      where: { terminalDbId: id },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
    return { success: true, data: rows };
  }

  @Post(':id/resync')
  async requestResync(@Param('id') id: string) {
    // flag terminal; EA polls /mql5/config and notices resyncRequested
    await this.prisma.auditLog.create({
      data: { actor: 'admin', action: 'RESYNC_REQUESTED', detail: { terminalDbId: id } },
    });
    return { success: true, data: { requested: true } };
  }
}
