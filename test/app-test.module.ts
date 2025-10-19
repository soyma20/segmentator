import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { FilesTestModule } from './files-test.module';
import { DatabaseModule } from '../src/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    FilesTestModule,
    // Exclude Redis-dependent modules for e2e testing:
    // - ProcessingModule (uses BullMQ queues)
    // - TranscriptionModule (uses BullMQ queues)
    // - AnalysisModule (uses BullMQ queues)
    // - ClippingModule (uses BullMQ queues)
    // - QueuesModule (BullMQ Redis connection)
    // - FfmpegModule (may have dependencies)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppTestModule {}
