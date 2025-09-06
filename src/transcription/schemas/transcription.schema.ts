import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { ProcessingHistory } from '../../processing/schemas/processing-history.schema';
import { File } from '../../files/schemas/file.schema';
import {
  TranscriptionSegment,
  TranscriptionSegmentSchema,
} from './transcription-segment.schema';
import { TranscriptionProvider } from 'src/common/enums/transcription-provider.enum';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Transcription extends Document {
  @Prop({ type: Types.ObjectId, ref: ProcessingHistory.name, required: true })
  processingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: File.name, required: true })
  fileId: Types.ObjectId;

  @Prop({ enum: TranscriptionProvider, required: true })
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
    default: 'pending',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  error?: string;
}
export const TranscriptionSchema = SchemaFactory.createForClass(Transcription);

TranscriptionSchema.index({ processingId: 1 });
TranscriptionSchema.index({ fullText: 'text', 'segments.text': 'text' });
TranscriptionSchema.index({ language: 1, transcriptionProvider: 1 });
