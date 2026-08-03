import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: env.MQL5_MAX_PAYLOAD_BYTES,
      disableRequestLogging: true,
    }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.CORS_ORIGIN?.split(',') ?? true, credentials: true });
  app.enableShutdownHooks();

  await app.listen(env.PORT_API, '0.0.0.0');
  console.log('API listening on port', env.PORT_API);
}
bootstrap().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});