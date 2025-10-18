import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProcessingHistory,
  ProcessingHistorySchema,
} from './schemas/processing-history.schema';
import {
  AnalysisResult,
  AnalysisResultSchema,
} from '../analysis/schemas/analysis.schema';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'clipping',
    }),
    MongooseModule.forFeature([
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
      { name: AnalysisResult.name, schema: AnalysisResultSchema },
    ]),
  ],
  controllers: [ProcessingController],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
