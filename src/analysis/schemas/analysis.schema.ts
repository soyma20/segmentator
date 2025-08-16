import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { ProcessingHistory } from '../../processing/schemas/processing-history.schema';
import { Transcription } from '../../transcription/schemas/transcription.schema';
import { File } from '../../files/schemas/file.schema';
import { Metrics, MetricsSchema } from './metrics.schema';
import {
  AnalyzedSegment,
  AnalyzedSegmentSchema,
} from './analyzed-segment.schema';
import {
  OptimizedSegment,
  OptimizedSegmentSchema,
} from './optimized-segment.schema';

@Schema({ timestamps: true })
export class AnalysisResult extends Document {
  @Prop({ type: Types.ObjectId, ref: ProcessingHistory.name, required: true })
  processingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: File.name, required: true })
  fileId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Transcription.name, required: true })
  transcriptionId: Types.ObjectId;

  @Prop({ required: true })
  llmProvider: string;

  @Prop({ required: true })
  llmModel: string;

  @Prop({ required: true })
  promptVersion: string;

  @Prop({ required: true })
  analysisLanguage: string;

  @Prop({ required: true })
  overallSummary: string;

  @Prop({ type: [String], default: [] })
  mainTopics: string[];

  @Prop({ required: true })
  videoType: string;

  @Prop({ required: true })
  estimatedAudience: string;

  @Prop({ type: [AnalyzedSegmentSchema], default: [] })
  analyzedSegments: AnalyzedSegment[];

  @Prop({ type: [OptimizedSegmentSchema], default: [] })
  optimizedSegments: OptimizedSegment[];

  @Prop({ type: MetricsSchema, required: true })
  processingMetrics: Metrics;
}
export const AnalysisResultSchema =
  SchemaFactory.createForClass(AnalysisResult);

AnalysisResultSchema.index({ fileId: 1, processingId: 1 });
AnalysisResultSchema.index({
  'analyzedSegments.informativenessScore': -1,
  'analyzedSegments.recommendedForExtraction': 1,
});
AnalysisResultSchema.index({ mainTopics: 1 });
AnalysisResultSchema.index({
  overallSummary: 'text',
  'analyzedSegments.title': 'text',
  'analyzedSegments.summary': 'text',
  'analyzedSegments.keyTopics': 'text',
});
AnalysisResultSchema.index({ llmProvider: 1, llmModel: 1 });
