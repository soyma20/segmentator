import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  ScoreDistribution,
  ScoreDistributionSchema,
} from './score-distribution.schema';

@Schema({ _id: false })
export class Metrics {
  @Prop({ required: true })
  totalSegmentsAnalyzed: number;

  @Prop({ required: true })
  highValueSegments: number;

  @Prop({ required: true })
  tokensUsed: number;

  @Prop({ required: true })
  processingTimeMs: number;

  @Prop({ required: true })
  averageScore: number;

  @Prop({ type: ScoreDistributionSchema, required: true })
  scoreDistribution: ScoreDistribution;
}
export const MetricsSchema = SchemaFactory.createForClass(Metrics);
