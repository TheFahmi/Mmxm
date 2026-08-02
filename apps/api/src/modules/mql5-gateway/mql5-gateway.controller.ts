import {
  Body, Controller, Get, HttpCode, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@mmxm/database';
import { Mql5SignatureGuard, Mql5AuthContext } from './mql5-signature.guard';
import { IngestionService } from './ingestion.service';
import {
  handshakeSchema, tickBatchSchema, candleSchema, heartbeatSchema,
  historyStartSchema, historyBatchSchema, historyCompleteSchema,
} from './dto';
import { randomUUID } from 'node:crypto';
import { ZodValidationPipe } from '../../common/zod.pipe';

@ApiTags('mql5')
@Controller('mql5')
@UseGuards(Mql5SignatureGuard)
export class Mql5GatewayController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingestion: IngestionService,
  ) {}

  @Post('handshake')
  @HttpCode(200)
  async handshake(
    @Body(new ZodValidationPipe(handshakeSchema)) body: unknown,
  ) {
    const dto = handshakeSchema.parse(body);
    const terminal = await this.prisma.mql5Terminal.upsert({
      where: { terminalId: dto.terminalId },
      create: {
        terminalId: dto.terminalId,
        terminalName: dto.terminalName,
        terminalBuild: dto.terminalBuild,
        brokerName: dto.brokerName,
        serverName: dto.serverName,
        accountIdHash: dto.accountIdHash,
        canonicalSymbol: 'XAUUSD',
        brokerSymbol: dto.brokerSymbol,
        symbolMetadata: {
          digits: dto.digits, point: dto.point, tickSize: dto.tickSize,
          tickValue: dto.tickValue, contractSize: dto.contractSize,
          minimumVolume: dto.minimumVolume, maximumVolume: dto.maximumVolume,
          volumeStep: dto.volumeStep,
        },
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      },
      update: {
        terminalBuild: dto.terminalBuild,
        brokerName: dto.brokerName,
        serverName: dto.serverName,
        brokerSymbol: dto.brokerSymbol,
        symbolMetadata: {
          digits: dto.digits, point: dto.point, tickSize: dto.tickSize,
          tickValue: dto.tickValue, contractSize: dto.contractSize,
          minimumVolume: dto.minimumVolume, maximumVolume: dto.maximumVolume,
          volumeStep: dto.volumeStep,
        },
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      },
    });

    await this.prisma.symbolMapping.upsert({
      where: {
        canonicalSymbol_brokerSymbol_brokerName: {
          canonicalSymbol: 'XAUUSD', brokerSymbol: dto.brokerSymbol, brokerName: dto.brokerName,
        },
      },
      create: {
        canonicalSymbol: 'XAUUSD', brokerSymbol: dto.brokerSymbol, brokerName: dto.brokerName,
        digits: dto.digits, point: dto.point, tickSize: dto.tickSize,
        tickValue: dto.tickValue, contractSize: dto.contractSize,
        minVolume: dto.minimumVolume, maxVolume: dto.maximumVolume, volumeStep: dto.volumeStep,
      },
      update: {
        digits: dto.digits, point: dto.point, tickSize: dto.tickSize,
        tickValue: dto.tickValue, contractSize: dto.contractSize,
        minVolume: dto.minimumVolume, maxVolume: dto.maximumVolume, volumeStep: dto.volumeStep,
      },
    });

    const connection = await this.prisma.mql5Connection.create({
      data: { terminalDbId: terminal.id },
    });

    return {
      success: true,
      data: {
        connectionId: connection.id,
        acceptedSymbol: 'XAUUSD',
        flushIntervalMs: 500,
        heartbeatIntervalSeconds: 5,
        sendTicks: true,
        sendCurrentCandles: true,
        sendClosedCandles: true,
        requiredTimeframes: ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'],
        serverTimestamp: new Date().toISOString(),
      },
    };
  }

  @Post('ticks/batch')
  @HttpCode(200)
  async ticksBatch(
    @Req() req: { mql5?: Mql5AuthContext },
    @Body(new ZodValidationPipe(tickBatchSchema)) body: unknown,
  ) {
    const dto = tickBatchSchema.parse(body);
    const ctx = req.mql5!;
    const r = await this.ingestion.ingestTicks(ctx.terminalDbId, dto.ticks);
    return { success: true, data: r };
  }

  @Post('candles/current')
  @HttpCode(200)
  async candleCurrent(
    @Req() req: { mql5?: Mql5AuthContext },
    @Body(new ZodValidationPipe(candleSchema)) body: unknown,
  ) {
    const dto = candleSchema.parse(body);
    const result = await this.ingestion.ingestCandle(req.mql5!.terminalDbId, { ...dto, isClosed: false });
    return { success: true, data: { result } };
  }

  @Post('candles/closed')
  @HttpCode(200)
  async candleClosed(
    @Req() req: { mql5?: Mql5AuthContext },
    @Body(new ZodValidationPipe(candleSchema)) body: unknown,
  ) {
    const dto = candleSchema.parse(body);
    const result = await this.ingestion.ingestCandle(req.mql5!.terminalDbId, { ...dto, isClosed: true });
    await this.ingestion.recordIngestion(dto.eventId, 'candles/closed', req.mql5!.terminalDbId,
      result === 'duplicated' ? 'DUPLICATE' : 'ACCEPTED');
    return { success: true, data: { result, duplicated: result === 'duplicated' } };
  }

  @Post('heartbeat')
  @HttpCode(200)
  async heartbeat(
    @Req() req: { mql5?: Mql5AuthContext },
    @Body(new ZodValidationPipe(heartbeatSchema)) body: unknown,
  ) {
    const dto = heartbeatSchema.parse(body);
    await this.prisma.$transaction([
      this.prisma.mql5Heartbeat.create({
        data: {
          terminalDbId: req.mql5!.terminalDbId,
          terminalConnected: dto.terminalConnected,
          tradeServerConnected: dto.tradeServerConnected,
          lastTickAt: dto.lastTickTimestamp ? new Date(dto.lastTickTimestamp) : null,
          pendingTickCount: dto.pendingTickCount,
          pendingCandleCount: dto.pendingCandleCount,
          pendingSpoolCount: dto.pendingSpoolCount,
          memoryUsedMb: dto.terminalMemoryUsedMb,
          serverTs: dto.serverTimestamp ? new Date(dto.serverTimestamp) : null,
        },
      }),
      this.prisma.mql5Terminal.update({
        where: { id: req.mql5!.terminalDbId },
        data: { status: 'ONLINE', lastHeartbeatAt: new Date() },
      }),
    ]);
    return { success: true, data: { received: true } };
  }

  @Post('history/start')
  @HttpCode(200)
  async historyStart(@Body(new ZodValidationPipe(historyStartSchema)) body: unknown) {
    const dto = historyStartSchema.parse(body);
    // batchId = server-issued so client can't collide
    return { success: true, data: { batchId: randomUUID(), accepted: true, expectedBars: dto.expectedBars } };
  }

  @Post('history/batch')
  @HttpCode(200)
  async historyBatch(
    @Req() req: { mql5?: Mql5AuthContext },
    @Body(new ZodValidationPipe(historyBatchSchema)) body: unknown,
  ) {
    const dto = historyBatchSchema.parse(body);
    let accepted = 0, duplicated = 0;
    for (const c of dto.candles) {
      const r = await this.ingestion.ingestCandle(req.mql5!.terminalDbId, { ...c, isClosed: true });
      if (r === 'duplicated') duplicated++; else accepted++;
    }
    return { success: true, data: { accepted, duplicated, sequence: dto.sequence } };
  }

  @Post('history/complete')
  @HttpCode(200)
  async historyComplete(@Body(new ZodValidationPipe(historyCompleteSchema)) body: unknown) {
    const dto = historyCompleteSchema.parse(body);
    // gap detection runs async in worker; just acknowledge
    return { success: true, data: { completed: true, sentBars: dto.sentBars } };
  }

  @Get('config')
  async config(@Req() req: { mql5?: Mql5AuthContext }) {
    return {
      success: true,
      data: {
        terminalId: req.mql5!.terminalId,
        flushIntervalMs: 500,
        heartbeatIntervalSeconds: 5,
        sendTicks: true,
        sendCurrentCandles: true,
        sendClosedCandles: true,
        requiredTimeframes: ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'],
      },
    };
  }
}
