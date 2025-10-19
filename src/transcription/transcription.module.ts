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
import { File, FileSchema } from '../files/schemas/file.schema';
import {
  ProcessingHistory,
  ProcessingHistorySchema,
} from '../processing/schemas/processing-history.schema';
import { QueuesModule } from '../queues/queues.module';
import { AudioProcessingModule } from '../common/providers/audio-processing/audio-processing.module';
import { FfmpegService } from '../services/ffmpeg/ffmpeg.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transcription.name, schema: TranscriptionSchema },
      { name: TranscriptionSegment.name, schema: TranscriptionSegmentSchema },
      { name: File.name, schema: FileSchema },
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
    ]),
    QueuesModule,
    AudioProcessingModule,
    BullModule.registerQueue({
      name: 'transcription',
    }),
    BullModule.registerQueue({
      name: 'analysis',
    }),
  ],
  controllers: [TranscriptionController],
  providers: [TranscriptionService, TranscriptionProcessor, FfmpegService],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
