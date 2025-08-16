import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { VideoType } from 'src/common/enums/video-type.enum';

@Schema({ _id: false })
export class AnalysisConfig {
  @Prop({ enum: VideoType, required: true })
  videoType: VideoType;

  @Prop({ type: [String], default: [] })
  focusAreas: string[];

  @Prop({ required: true })
  targetAudience: string;

  @Prop({ required: true })
  minInformativenessScore: number;

  @Prop({ required: true })
  maxCombinedDuration: number;
}
export const AnalysisConfigSchema =
  SchemaFactory.createForClass(AnalysisConfig);
