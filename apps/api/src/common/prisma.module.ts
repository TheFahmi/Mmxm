import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@mmxm/database';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient({ log: ['warn', 'error'] }),
    },
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
