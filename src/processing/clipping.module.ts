import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';

import { ClippingProcessor } from './processors/clipping.processor';
import { FfmpegService } from '../services/ffmpeg/ffmpeg.service';
import {
  AnalysisResult,
  AnalysisResultSchema,
} from '../analysis/schemas/analysis.schema';
import {
  ProcessingHistory,
  ProcessingHistorySchema,
} from './schemas/processing-history.schema';
import { File, FileSchema } from '../files/schemas/file.schema';
import { VideoClip, VideoClipSchema } from './schemas/video-clip.schema';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'clipping',
    }),
    MongooseModule.forFeature([
      { name: AnalysisResult.name, schema: AnalysisResultSchema },
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
      { name: File.name, schema: FileSchema },
      { name: VideoClip.name, schema: VideoClipSchema },
    ]),
  ],
  providers: [ClippingProcessor, FfmpegService],
  exports: [ClippingProcessor],
})
export class ClippingModule {}
