import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { ProcessingStatus } from '../../common/enums/processing-status.enum';
import { Configuration, ConfigurationSchema } from './configuration.schema';
import {
  ProcessingMetrics,
  ProcessingMetricsSchema,
} from './processing-metrics.schema';
import { ErrorDetails, ErrorDetailsSchema } from './error-detail.shema';

@Schema({ timestamps: true })
export class ProcessingHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'File', required: true })
  fileId: Types.ObjectId;

  @Prop({ required: true })
  processingStartedAt: Date;

  @Prop()
  processingCompletedAt?: Date;

  @Prop({ type: String, enum: ProcessingStatus, required: true })
  processingStatus: ProcessingStatus;

  @Prop({ type: ConfigurationSchema, required: true })
  configuration: Configuration;

  @Prop({ type: ProcessingMetricsSchema, default: {} })
  processing_metrics: ProcessingMetrics;

  @Prop({ type: ErrorDetailsSchema })
  errorDetails?: ErrorDetails;
}

export const ProcessingHistorySchema =
  SchemaFactory.createForClass(ProcessingHistory);

ProcessingHistorySchema.index({ fileId: 1, processingStatus: 1 });
ProcessingHistorySchema.index({ processingStartedAt: -1 });
ProcessingHistorySchema.index({
  fileId: 1,
  'configuration.llmProvider': 1,
  'configuration.llmModel': 1,
});
ProcessingHistorySchema.index(
  { processingStartedAt: 1 },
  {
    expireAfterSeconds: 2592000, // 30 days
    partialFilterExpression: { processingStatus: 'failed' },
  },
);
