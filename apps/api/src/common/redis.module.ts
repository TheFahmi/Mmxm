import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
