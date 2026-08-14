import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: env.MQL5_MAX_PAYLOAD_BYTES,
      // keep raw body for HMAC verification
      disableRequestLogging: true,
    }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  process.on('uncaughtException', err => { console.error('uncaught', err); process.exit(1); });
  process.on('unhandledRejection', r => { console.error('unhandled', r); process.exit(1); });

  // Raw body note: Nest/Fastify re-registers application/json parser after
  // removeContentTypeParser, so overriding it throws FST_ERR_CTP_ALREADY_PRESENT.
  // HMAC signs JSON.stringify(req.body) — the MQL5 EA must emit canonical JSON with
  // no trailing-zero floats (MmxmJsonNum trims to shortest repr) so both sides match.

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.CORS_ORIGIN?.split(',') ?? true, credentials: true });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('MMXM XAUUSD Signal API')
    .setVersion('0.1')
    .addApiKey({ type: 'apiKey', name: 'X-MMXM-API-KEY', in: 'header' }, 'mql5')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  await app.listen(env.PORT_API, '0.0.0.0');
}
bootstrap();
