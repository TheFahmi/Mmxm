import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: FastifyRequest, _res: FastifyReply, next: () => void) {
    const chunks: Buffer[] = [];
    const origOnData = (req.raw as any)._rawOnData;
    (req.raw as any).on('data', (chunk: Buffer) => chunks.push(chunk));
    (req.raw as any).on('end', () => {
      (req as any).rawBody = Buffer.concat(chunks).toString('utf8');
    });
    next();
  }
}