import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { LlmProvider } from 'src/common/enums/llm-provider.enum';
import { AnalysisConfig, AnalysisConfigSchema } from './analysis-config.schema';

@Schema({ _id: false })
export class Configuration {
  @Prop({ required: true })
  segmentDuration: number;

  @Prop({ enum: LlmProvider, required: true })
  llmProvider: LlmProvider;

  @Prop({ required: true })
  llmModel: string;

  @Prop({ type: AnalysisConfigSchema, required: true })
  analysisConfig: AnalysisConfig;
}
export const ConfigurationSchema = SchemaFactory.createForClass(Configuration);
