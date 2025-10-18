import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ClippingConfig {
  @Prop({ required: true })
  maxClips: number;

  @Prop({ required: true })
  minScoreThreshold: number;
}

export const ClippingConfigSchema =
  SchemaFactory.createForClass(ClippingConfig);
