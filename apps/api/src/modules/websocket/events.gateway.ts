import {
  WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { REDIS } from '../../common/redis.module';
import { env } from '../../config/env';

@WebSocketGateway({ cors: { origin: true, credentials: true }, path: '/ws' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(EventsGateway.name);
  private sub!: Redis;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleDestroy() {
    this.sub?.disconnect();
  }

  afterInit() {
    // fan-out: subscribe to internal pub/sub channels and re-emit as WS events
    this.sub = new Redis(env.REDIS_URL);
    const channels = [
      'mmxm:pub:candle.current',
      'mmxm:pub:tick',
      'mmxm:pub:signal.preliminary',
      'mmxm:pub:signal.confirmed',
      'mmxm:pub:signal.active',
      'mmxm:pub:signal.invalidated',
      'mmxm:pub:signal.completed',
      'mmxm:pub:liquidity.swept',
      'mmxm:pub:structure.updated',
      'mmxm:pub:mmxm.stage',
      'mmxm:pub:terminal.status',
      'mmxm:pub:gap',
    ];
    this.sub.subscribe(...channels).catch(e => this.log.error('subscribe failed', e));
    this.sub.on('message', (channel, message) => {
      const event = channel.replace('mmxm:pub:', 'xauusd.');
      this.server.emit(event, JSON.parse(message));
    });
    this.log.log('WS gateway ready');
  }

  handleConnection(client: Socket) {
    this.log.debug(`client connected ${client.id}`);
  }
}
