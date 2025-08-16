import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class OptimizedSegment {
  @Prop({ required: true })
  _id: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true })
  duration: number;

  @Prop({ type: [String], default: [] })
  combinedSegmentIds: string[];

  @Prop({ required: true })
  aggregatedScore: number;

  @Prop({ required: true })
  finalTitle: string;

  @Prop({ required: true })
  finalSummary: string;

  @Prop({ type: [String], default: [] })
  finalKeyTopics: string[];

  @Prop({ required: true })
  extractionPriority: number;
}
export const OptimizedSegmentSchema =
  SchemaFactory.createForClass(OptimizedSegment);
