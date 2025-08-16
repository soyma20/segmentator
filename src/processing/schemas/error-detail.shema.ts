import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ErrorDetails {
  @Prop({ required: true })
  stage: string;

  @Prop({ required: true })
  message: string;

  @Prop()
  stackTrace?: string;
}
export const ErrorDetailsSchema = SchemaFactory.createForClass(ErrorDetails);
