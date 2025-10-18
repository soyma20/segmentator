import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';

export class TriggerTranscriptionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]{24}$/, {
    message: 'fileId must be a valid MongoDB ObjectId',
  })
  fileId: string;

  @IsString()
  @IsOptional()
  languageCode?: string;
}
