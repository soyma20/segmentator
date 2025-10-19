import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import {
  ClippingJobData,
  ClippingJobResult,
} from './processors/clipping.processor';
import { AnalysisResult } from '../analysis/schemas/analysis.schema';
import { ProcessingHistory } from './schemas/processing-history.schema';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @InjectQueue('clipping')
    private clippingQueue: Queue<ClippingJobData>,
    @InjectModel(AnalysisResult.name)
    private analysisResultModel: Model<AnalysisResult>,
  ) {}

  /**
   * Triggers video clipping job based on analysis results
   * Override parameters take precedence over stored configuration
   */
  async triggerClippingJob(
    analysisId: string,
    options: {
      maxClips?: number;
      minScoreThreshold?: number;
      maxCombinedDuration?: number;
    } = {},
  ): Promise<void> {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new Error(
        `Invalid analysis ID format: ${analysisId}. Must be a valid MongoDB ObjectId.`,
      );
    }

    // Fetch analysis result to get stored configuration
    const analysisResult = await this.analysisResultModel
      .findById(analysisId)
      .populate('processingId')
      .exec();

    if (!analysisResult) {
      throw new Error(`Analysis result not found: ${analysisId}`);
    }

    // Cast the populated processingId to ProcessingHistory
    const processingHistory =
      analysisResult.processingId as unknown as ProcessingHistory;

    // Get configuration values with override support
    const maxClips =
      options.maxClips ??
      processingHistory.configuration.clippingConfig.maxClips;
    const minScoreThreshold =
      options.minScoreThreshold ??
      processingHistory.configuration.clippingConfig.minScoreThreshold;
    const maxCombinedDuration =
      options.maxCombinedDuration ??
      processingHistory.configuration.analysisConfig.maxCombinedDuration;

    this.logger.log(
      `Triggering clipping job for analysis ${analysisId} with maxClips: ${maxClips}, minScore: ${minScoreThreshold}, maxCombinedDuration: ${maxCombinedDuration}`,
    );

    // Log if override values are being used
    if (options.maxClips !== undefined) {
      this.logger.log(
        `Using override maxClips: ${options.maxClips} (config: ${processingHistory.configuration.clippingConfig.maxClips})`,
      );
    }
    if (options.minScoreThreshold !== undefined) {
      this.logger.log(
        `Using override minScoreThreshold: ${options.minScoreThreshold} (config: ${processingHistory.configuration.clippingConfig.minScoreThreshold})`,
      );
    }
    if (options.maxCombinedDuration !== undefined) {
      this.logger.log(
        `Using override maxCombinedDuration: ${options.maxCombinedDuration} (config: ${processingHistory.configuration.analysisConfig.maxCombinedDuration})`,
      );
    }

    try {
      await this.clippingQueue.add(
        'clip-video',
        {
          analysisResult: { _id: analysisId },
          maxClips,
          minScoreThreshold,
          maxCombinedDuration,
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

      this.logger.log(
        `Clipping job queued successfully for analysis ${analysisId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue clipping job for analysis ${analysisId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Gets clipping job status
   */
  async getClippingJobStatus(analysisId: string): Promise<{
    id: string;
    status: string;
    progress: number;
    result?: ClippingJobResult;
    error?: string;
    createdAt: number;
    processedAt?: number;
  } | null> {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new Error(
        `Invalid analysis ID format: ${analysisId}. Must be a valid MongoDB ObjectId.`,
      );
    }

    const jobs = await this.clippingQueue.getJobs([
      'waiting',
      'active',
      'completed',
      'failed',
    ]);
    const job = jobs.find((j) => j.data.analysisResult._id === analysisId);

    if (!job) {
      return null;
    }

    return {
      id: job.id || 'unknown',
      status: (await job.getState()) as string,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue as ClippingJobResult | undefined,
      error: job.failedReason || undefined,
      createdAt: job.timestamp || 0,
      processedAt: job.processedOn || undefined,
    };
  }
}
