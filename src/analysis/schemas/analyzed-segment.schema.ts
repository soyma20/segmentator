import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class AnalyzedSegment {
  @Prop({ required: true })
  segmentId: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true })
  duration: number;

  @Prop({ required: true })
  informativenessScore: number;

  @Prop({ required: true })
  percentileRank: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  keyTopics: string[];

  @Prop({ required: true })
  reasoning: string;

  @Prop({ required: true })
  recommendedForExtraction: boolean;

  @Prop({ required: true })
  shouldCombineWithNext: boolean;

  @Prop()
  combinationReason?: string;

  @Prop({ required: true })
  keywordDensity: number;

  @Prop()
  sentimentScore?: number;

  @Prop()
  technicalComplexity?: number;
}

export const AnalyzedSegmentSchema =
  SchemaFactory.createForClass(AnalyzedSegment);
