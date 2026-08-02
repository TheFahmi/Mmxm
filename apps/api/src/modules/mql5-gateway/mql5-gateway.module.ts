import { Module } from '@nestjs/common';
import { Mql5GatewayController } from './mql5-gateway.controller';
import { Mql5SignatureGuard } from './mql5-signature.guard';
import { IngestionService } from './ingestion.service';

@Module({
  controllers: [Mql5GatewayController],
  providers: [Mql5SignatureGuard, IngestionService],
  exports: [IngestionService],
})
export class Mql5GatewayModule {}
