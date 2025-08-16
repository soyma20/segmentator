import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Resolution {
  @Prop({ required: true })
  width: number;

  @Prop({ required: true })
  height: number;
}
export const ResolutionSchema = SchemaFactory.createForClass(Resolution);
