import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env';
import { PrismaModule } from './common/prisma.module';
import { RedisModule } from './common/redis.module';
import { Mql5GatewayModule } from './modules/mql5-gateway/mql5-gateway.module';
import { Mql5TerminalModule } from './modules/mql5-terminal/mql5-terminal.module';
import { HealthModule } from './modules/health/health.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { SignalModule } from './modules/signal/signal.module';
import { BacktestModule } from './modules/backtest/backtest.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        redact: {
          paths: [
            'req.headers["x-mmxm-api-key"]',
            'req.headers["x-mmxm-signature"]',
            'req.headers.authorization',
          ],
          censor: '[redacted]',
        },
      },
    }),
    PrismaModule,
    RedisModule,
    Mql5GatewayModule,
    Mql5TerminalModule,
    HealthModule,
    WebsocketModule,
    SignalModule,
    BacktestModule,
  ],
})
export class AppModule {}
