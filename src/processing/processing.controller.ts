import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Types } from 'mongoose';
import { ProcessingService } from './processing.service';

export class TriggerClippingDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]{24}$/, {
    message:
      'analysisId must be a valid MongoDB ObjectId (24 character hex string)',
  })
  analysisId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxClips?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  minScoreThreshold?: number;
}

interface ClippingJobStatus {
  id: string;
  status: string;
  progress: number;
  result?: any;
  error?: string;
  createdAt: number;
  processedAt?: number;
}

@Controller('processing')
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(private readonly processingService: ProcessingService) {}

  @Post('clipping/trigger')
  async triggerClipping(@Body() dto: TriggerClippingDto) {
    this.logger.log(`Triggering clipping for analysis: ${dto.analysisId}`);

    try {
      await this.processingService.triggerClippingJob(dto.analysisId, {
        maxClips: dto.maxClips,
        minScoreThreshold: dto.minScoreThreshold,
      });

      return {
        message: 'Clipping job triggered successfully',
        analysisId: dto.analysisId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to trigger clipping job: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('clipping/status/:analysisId')
  async getClippingStatus(
    @Param('analysisId') analysisId: string,
  ): Promise<ClippingJobStatus | { message: string; analysisId: string }> {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new HttpException(
        `Invalid analysis ID format: ${analysisId}. Must be a valid MongoDB ObjectId.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const status =
      await this.processingService.getClippingJobStatus(analysisId);

    if (!status) {
      return {
        message: 'No clipping job found for this analysis',
        analysisId,
      };
    }

    return {
      analysisId,
      ...status,
    } as ClippingJobStatus;
  }
}
