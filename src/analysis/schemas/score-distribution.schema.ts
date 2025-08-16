import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ScoreDistribution {
  @Prop({ required: true }) ['1-3']: number;
  @Prop({ required: true }) ['4-6']: number;
  @Prop({ required: true }) ['7-8']: number;
  @Prop({ required: true }) ['9-10']: number;
}
export const ScoreDistributionSchema =
  SchemaFactory.createForClass(ScoreDistribution);
