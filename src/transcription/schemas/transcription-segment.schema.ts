import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class TranscriptionSegment {
  @Prop({ required: true })
  _id: string;

  @Prop({ required: true })
  startTime: string; // formatted time (e.g., "00:01:30")

  @Prop({ required: true })
  endTime: string; // formatted time (e.g., "00:02:30")

  @Prop({ required: true })
  startSeconds: number;

  @Prop({ required: true })
  endSeconds: number;

  @Prop({ required: true })
  duration: number;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  wordCount: number;

  @Prop({ required: true })
  avgConfidence: number;

  @Prop({ default: false })
  speakerChange: boolean;
}

export const TranscriptionSegmentSchema =
  SchemaFactory.createForClass(TranscriptionSegment);
