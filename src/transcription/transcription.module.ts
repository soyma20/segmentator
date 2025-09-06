import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';
import { TranscriptionProcessor } from './processors/transcription.processor';
import {
  Transcription,
  TranscriptionSchema,
} from './schemas/transcription.schema';
import {
  TranscriptionSegment,
  TranscriptionSegmentSchema,
} from './schemas/transcription-segment.schema';
import { QueuesModule } from 'src/queues/queues.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transcription.name, schema: TranscriptionSchema },
      { name: TranscriptionSegment.name, schema: TranscriptionSegmentSchema },
    ]),
    QueuesModule,
    BullModule.registerQueue({
      name: 'transcription',
    }),
  ],
  controllers: [TranscriptionController],
  providers: [TranscriptionService, TranscriptionProcessor],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
