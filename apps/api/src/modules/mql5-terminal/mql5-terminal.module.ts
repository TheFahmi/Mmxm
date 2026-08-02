import { Module } from '@nestjs/common';
import { Mql5TerminalController } from './mql5-terminal.controller';

@Module({ controllers: [Mql5TerminalController] })
export class Mql5TerminalModule {}
