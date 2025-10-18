import {
  Controller,
  Post,
  Body,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AnalysisJobData } from './processors/analysis.processor';

export class ReRunAnalysisDto {
  transcriptionId: string;
}

@Controller('analysis')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    @InjectQueue('analysis')
    private analysisQueue: Queue<AnalysisJobData>,
  ) {}

  @Post('rerun')
  async reRunAnalysis(@Body() dto: ReRunAnalysisDto) {
    this.logger.log(
      `Re-running analysis for transcription: ${dto.transcriptionId}`,
    );

    try {
      await this.analysisQueue.add(
        'analyze-segments',
        {
          transcription: { _id: dto.transcriptionId },
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );

      return {
        message: 'Analysis job queued successfully',
        transcriptionId: dto.transcriptionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to queue analysis job: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
