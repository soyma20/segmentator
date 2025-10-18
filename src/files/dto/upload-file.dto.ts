import {
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { LlmProvider } from 'src/common/enums/llm-provider.enum';
import { VideoType } from 'src/common/enums/video-type.enum';

export class AnalysisConfigDto {
  @IsEnum(VideoType)
  videoType: VideoType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  focusAreas?: string[];

  @IsString()
  targetAudience: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  minInformativenessScore: number;

  @IsNumber()
  @Min(1)
  maxCombinedDuration: number;
}

export class ProcessingConfigurationDto {
  @IsNumber()
  @Min(10)
  @Max(300)
  segmentDuration: number;

  @IsEnum(LlmProvider)
  llmProvider: LlmProvider;

  @IsString()
  llmModel: string;

  @IsOptional()
  analysisConfig?: AnalysisConfigDto;
}

export class UploadFileDto {
  @IsString()
  languageCode: string;

  @IsOptional()
  processingConfiguration?: ProcessingConfigurationDto;
}
