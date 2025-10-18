import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import {
  AnalysisResult,
  AnalysisResultSchema,
} from './schemas/analysis.schema';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { AnalysisProcessor } from './processors/analysis.processor';
import { TranscriptionModule } from '../transcription/transcription.module';
import { OpenaiModule } from '../external-apis/openai/openai.module';
import {
  ProcessingHistory,
  ProcessingHistorySchema,
} from '../processing/schemas/processing-history.schema';
import {
  Transcription,
  TranscriptionSchema,
} from '../transcription/schemas/transcription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalysisResult.name, schema: AnalysisResultSchema },
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
      { name: Transcription.name, schema: TranscriptionSchema },
    ]),
    BullModule.registerQueue({
      name: 'analysis',
    }),
    TranscriptionModule,
    OpenaiModule,
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisProcessor],
  exports: [AnalysisService],
})
export class AnalysisModule {}
