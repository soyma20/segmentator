import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { LlmProvider } from '../../common/enums/llm-provider.enum';
import { AnalysisConfig, AnalysisConfigSchema } from './analysis-config.schema';
import { ClippingConfig, ClippingConfigSchema } from './clipping-config.schema';

@Schema({ _id: false })
export class Configuration {
  @Prop({ required: true })
  segmentDuration: number;

  @Prop({ type: String, enum: LlmProvider, required: true })
  llmProvider: LlmProvider;

  @Prop({ required: true })
  llmModel: string;

  @Prop({ type: AnalysisConfigSchema, required: true })
  analysisConfig: AnalysisConfig;

  @Prop({ type: ClippingConfigSchema, required: true })
  clippingConfig: ClippingConfig;
}
export const ConfigurationSchema = SchemaFactory.createForClass(Configuration);
