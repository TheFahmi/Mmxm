import { Module } from '@nestjs/common';
import { MarketDataController } from './market-data.controller';

@Module({ controllers: [MarketDataController] })
export class MarketDataModule {}
