import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaClient } from '@mmxm/database';
import { env } from '../../config/env';
import { REDIS } from '../../common/redis.module';
import type { FastifyRequest } from 'fastify';

export interface Mql5AuthContext {
  terminalDbId: string;
  terminalId: string;
  brokerSymbol: string;
}

@Injectable()
export class Mql5SignatureGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer; mql5?: Mql5AuthContext }>();
    const h = req.headers;
    const apiKey = h['x-mmxm-api-key'] as string | undefined;
    const timestamp = h['x-mmxm-timestamp'] as string | undefined;
    const nonce = h['x-mmxm-nonce'] as string | undefined;
    const signature = h['x-mmxm-signature'] as string | undefined;
    const terminalId = h['x-mmxm-terminal-id'] as string | undefined;

    if (!apiKey || !timestamp || !nonce || !signature || !terminalId) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'missing auth headers' });
    }
    if (apiKey !== env.MQL5_API_KEY) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'bad api key' });
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) throw new UnauthorizedException({ code: 'STALE_TIMESTAMP' });
    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skew > env.MQL5_TIMESTAMP_SKEW_SECONDS) {
      throw new UnauthorizedException({ code: 'STALE_TIMESTAMP', message: `skew=${skew}s` });
    }

    // nonce single-use
    const nonceKey = `mmxm:nonce:${terminalId}:${nonce}`;
    const set = await this.redis.set(nonceKey, '1', 'EX', env.MQL5_NONCE_TTL_SECONDS, 'NX');
    if (set !== 'OK') {
      throw new UnauthorizedException({ code: 'NONCE_REUSED' });
    }

    // rawBody not available (parser skip) — EA produces deterministic JSON, so reserialize
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const expected = createHmac('sha256', env.MQL5_API_SECRET)
      .update(`${timestamp}.${nonce}.${raw}`)
      .digest('hex');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException({ code: 'BAD_SIGNATURE' });
    }

    const terminal = await this.prisma.mql5Terminal.findUnique({ where: { terminalId } });
    if (!terminal) {
      // allow handshake to register the terminal
      if (!req.url?.includes('/mql5/handshake')) {
        throw new UnauthorizedException({ code: 'UNKNOWN_TERMINAL' });
      }
      req.mql5 = { terminalDbId: '', terminalId, brokerSymbol: '' };
      return true;
    }
    req.mql5 = { terminalDbId: terminal.id, terminalId, brokerSymbol: terminal.brokerSymbol };
    return true;
  }
}
