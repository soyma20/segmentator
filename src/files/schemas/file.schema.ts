import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import { Resolution, ResolutionSchema } from './resolution.schema';
import { StorageType } from '../../common/enums/storage-type.enum';

@Schema({ timestamps: true })
export class File extends Document {
  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  storedName: string;

  @Prop({ required: true })
  filePath: string;

  @Prop({ type: String, enum: StorageType, required: true })
  storageType: StorageType;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ required: true })
  duration: number;

  @Prop({ required: true })
  format: string;

  @Prop()
  videoCodec?: string;

  @Prop()
  audioCodec?: string;

  @Prop({ type: ResolutionSchema })
  resolution?: Resolution;

  @Prop()
  bitrate?: number;

  @Prop()
  frameRate?: number;

  @Prop({ required: true })
  uploadedAt: Date;

  @Prop()
  lastProcessedAt?: Date;

  @Prop({ default: 0 })
  totalProcessingRuns: number;
}
export const FileSchema = SchemaFactory.createForClass(File);

FileSchema.index({ format: 1, duration: 1 });
FileSchema.index({ uploadedAt: -1 });
FileSchema.index({ duration: 1 });
