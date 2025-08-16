import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ProcessingMetrics {
  @Prop() audioExtractionTime?: number;
  @Prop() transcriptionTime?: number;
  @Prop() analysisTime?: number;
  @Prop() totalTime?: number;
  @Prop() llmTokensUsed?: number;
  @Prop() estimatedCost?: number;
}
export const ProcessingMetricsSchema =
  SchemaFactory.createForClass(ProcessingMetrics);
