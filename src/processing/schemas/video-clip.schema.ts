import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class VideoClip extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AnalysisResult', required: true })
  analysisId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'File', required: true })
  originalFileId: Types.ObjectId;

  @Prop({ required: true })
  clipId: string;

  @Prop({ required: true })
  originalSegmentId: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true })
  duration: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  rank: number;

  @Prop({ required: true })
  clipPath: string;

  @Prop()
  thumbnailPath?: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ default: 'active' })
  status: 'active' | 'deleted' | 'archived';
}

export const VideoClipSchema = SchemaFactory.createForClass(VideoClip);

// Indexes for efficient querying
VideoClipSchema.index({ analysisId: 1 });
VideoClipSchema.index({ originalFileId: 1 });
VideoClipSchema.index({ clipId: 1 }, { unique: true });
VideoClipSchema.index({ rank: 1 });
VideoClipSchema.index({ score: -1 });
VideoClipSchema.index({ createdAt: -1 });
