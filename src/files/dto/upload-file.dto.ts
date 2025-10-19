import {
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsOptional,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';
import { LlmProvider } from '../../common/enums/llm-provider.enum';
import { VideoType } from '../../common/enums/video-type.enum';

export class ClippingConfigDto {
  @IsNumber()
  @Min(1)
  @Max(50)
  maxClips: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  minScoreThreshold: number;
}

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

  @IsOptional()
  clippingConfig?: ClippingConfigDto;
}

export class UploadFileDto {
  @IsString()
  @IsNotEmpty()
  languageCode: string;

  @IsOptional()
  processingConfiguration?: ProcessingConfigurationDto;
}
