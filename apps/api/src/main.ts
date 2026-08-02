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

  // raw body needed for signature check on ingestion routes
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8') || '{}'));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

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
