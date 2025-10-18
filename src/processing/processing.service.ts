import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  ClippingJobData,
  ClippingJobResult,
} from './processors/clipping.processor';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @InjectQueue('clipping')
    private clippingQueue: Queue<ClippingJobData>,
  ) {}

  /**
   * Triggers video clipping job based on analysis results
   */
  async triggerClippingJob(
    analysisId: string,
    options: {
      maxClips?: number;
      minScoreThreshold?: number;
    } = {},
  ): Promise<void> {
    const { maxClips = 10, minScoreThreshold = 6 } = options;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new Error(
        `Invalid analysis ID format: ${analysisId}. Must be a valid MongoDB ObjectId.`,
      );
    }

    this.logger.log(
      `Triggering clipping job for analysis ${analysisId} with maxClips: ${maxClips}, minScore: ${minScoreThreshold}`,
    );

    try {
      await this.clippingQueue.add(
        'clip-video',
        {
          analysisResult: { _id: analysisId },
          maxClips,
          minScoreThreshold,
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
