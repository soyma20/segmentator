import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ProcessingHistory } from '../../processing/schemas/processing-history.schema';
import { File } from '../../files/schemas/file.schema';
import {
  TranscriptionSegment,
  TranscriptionSegmentSchema,
} from './transcription-segment.schema';
import { TranscriptionProvider } from '../../common/enums/transcription-provider.enum';

export enum TranscriptionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Transcription extends Document {
  @Prop({ type: Types.ObjectId, ref: ProcessingHistory.name })
  processingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: File.name, required: true })
  fileId: Types.ObjectId;

  @Prop({
    type: String,
    enum: TranscriptionProvider,
    default: TranscriptionProvider.GOOGLE_SPEECH,
  })
  transcriptionProvider: TranscriptionProvider;

  @Prop({ required: true })
  language: string;

  @Prop({ required: true })
  confidence: number;

  @Prop({ type: [TranscriptionSegmentSchema], default: [] })
  segments: TranscriptionSegment[];

  @Prop({ required: true })
  totalSegments: number;

  @Prop({ required: true })
  totalWords: number;

  @Prop({ required: true })
  fullText: string;

  @Prop({
    type: String,
    enum: TranscriptionStatus,
    default: TranscriptionStatus.PENDING,
  })
  status: TranscriptionStatus;

  @Prop()
  error?: string;

  @Prop()
  completedAt?: Date;
}

export const TranscriptionSchema = SchemaFactory.createForClass(Transcription);

// Indexes
TranscriptionSchema.index({ processingId: 1 });
TranscriptionSchema.index({ fileId: 1 });
TranscriptionSchema.index({ status: 1 });
// TranscriptionSchema.index({ language: 1, transcriptionProvider: 1 });
