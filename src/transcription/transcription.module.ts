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
import { QueuesModule } from 'src/queues/queues.module';
import { GoogleSpeechService } from 'src/external-apis/google-speech/google-speech.service';
import { FfmpegService } from 'src/services/ffmpeg/ffmpeg.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transcription.name, schema: TranscriptionSchema },
      { name: TranscriptionSegment.name, schema: TranscriptionSegmentSchema },
      { name: File.name, schema: FileSchema },
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
    ]),
    QueuesModule,
    BullModule.registerQueue({
      name: 'transcription',
    }),
    BullModule.registerQueue({
      name: 'analysis',
    }),
  ],
  controllers: [TranscriptionController],
  providers: [
    TranscriptionService,
    TranscriptionProcessor,
    GoogleSpeechService,
    FfmpegService,
  ],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
