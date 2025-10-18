import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';

import { AnalysisService } from '../analysis.service';
import { TranscriptionService } from '../../transcription/transcription.service';
import { ProcessingHistory } from '../../processing/schemas/processing-history.schema';
import { Transcription } from '../../transcription/schemas/transcription.schema';
import { AnalysisResult } from '../schemas/analysis.schema';
import { getErrorMessage } from '../../common/utils/error.utils';
import { ClippingJobData } from '../../processing/processors/clipping.processor';

export interface AnalysisJobData {
  transcription: {
    _id: string;
  };
}

export interface AnalysisJobResult {
  transcriptionId: string;
  analysisId: string;
  status: 'completed' | 'failed';
  error?: string;
}

@Processor('analysis')
@Injectable()
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly transcriptionService: TranscriptionService,
    @InjectModel(ProcessingHistory.name)
    private processingHistoryModel: Model<ProcessingHistory>,
    @InjectModel(Transcription.name)
    private transcriptionModel: Model<Transcription>,
    @InjectModel(AnalysisResult.name)
    private analysisResultModel: Model<AnalysisResult>,
    @InjectQueue('clipping')
    private clippingQueue: Queue<ClippingJobData>,
  ) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<AnalysisJobResult> {
    const { transcription } = job.data;
    const transcriptionId = transcription._id;

    this.logger.log(
      `Starting analysis job for transcription: ${transcriptionId}`,
    );

    let transcriptionRecord: Transcription | null = null;

    try {
      // Get transcription with segments
      transcriptionRecord = await this.transcriptionModel
        .findById(transcriptionId)
        .exec();

      if (!transcriptionRecord) {
        throw new Error(`Transcription not found: ${transcriptionId}`);
      }

      // Get processing history for configuration
      const processingHistory = await this.processingHistoryModel
        .findOne({ fileId: String(transcriptionRecord.fileId) })
        .exec();

      if (!processingHistory) {
        throw new Error(
          `Processing history not found for file: ${String(transcriptionRecord.fileId)}`,
        );
      }

      // Update processing status
      await this.updateProcessingStatus(
        String(processingHistory._id),
        'analysis',
        'Analysis started',
      );

      // Perform analysis
      const analysisResult = await this.analysisService.analyzeSegments(
        transcriptionRecord,
        processingHistory.configuration,
      );

      // Save analysis result
      const savedAnalysis = await this.analysisResultModel.create({
        processingId: processingHistory._id,
        fileId: transcriptionRecord.fileId,
        transcriptionId: transcriptionRecord._id,
        llmProvider: processingHistory.configuration.llmProvider,
        llmModel: processingHistory.configuration.llmModel,
        promptVersion: '1.0',
        analysisLanguage: 'en', // TODO: Get from configuration
        overallSummary: analysisResult.overallSummary,
        mainTopics: analysisResult.mainTopics,
        videoType: processingHistory.configuration.analysisConfig.videoType,
        estimatedAudience:
          processingHistory.configuration.analysisConfig.targetAudience,
        analyzedSegments: analysisResult.analyzedSegments,
        optimizedSegments: analysisResult.optimizedSegments,
        processingMetrics: analysisResult.metrics,
      });

      // Update processing status to completed
      await this.updateProcessingStatus(
        String(processingHistory._id),
        'completed',
        'Analysis completed successfully',
      );

      // Automatically trigger clipping job after successful analysis
      await this.triggerAutoClipping(
        savedAnalysis,
        processingHistory.configuration,
      );

      this.logger.log(
        `Analysis completed successfully for transcription: ${transcriptionId}`,
      );

      return {
        transcriptionId,
        analysisId: String(savedAnalysis._id),
        status: 'completed',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `Analysis failed for transcription: ${transcriptionId}`,
        errorMessage,
      );

      // Update processing status to failed
      try {
        const processingHistory = await this.processingHistoryModel
          .findOne({
            fileId: transcriptionRecord?.fileId
              ? String(transcriptionRecord.fileId)
              : undefined,
          })
          .exec();

        if (processingHistory) {
          await this.updateProcessingStatus(
            String(processingHistory._id),
            'failed',
            `Analysis failed: ${errorMessage}`,
          );
        }
      } catch (updateError) {
        this.logger.error(
          'Failed to update processing status to failed',
          getErrorMessage(updateError),
        );
      }

      return {
        transcriptionId,
        analysisId: '',
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Automatically triggers clipping job after successful analysis
   */
  private async triggerAutoClipping(
    analysisResult: AnalysisResult,
    configuration: ProcessingHistory['configuration'],
  ): Promise<void> {
    try {
      // Check if there are any optimized segments worth clipping
      const highValueSegments = analysisResult.optimizedSegments.filter(
        (segment) =>
          segment.aggregatedScore >=
          (configuration.analysisConfig.minInformativenessScore || 5),
      );

      if (highValueSegments.length === 0) {
        this.logger.log(
          `No high-value segments found for auto-clipping. Skipping automatic clipping for analysis: ${analysisResult._id}`,
        );
        return;
      }

      // Use configuration-based clipping parameters
      const clippingOptions = {
        maxClips: configuration.clippingConfig.maxClips,
        minScoreThreshold: configuration.clippingConfig.minScoreThreshold,
      };

      // Queue the clipping job
      await this.clippingQueue.add(
        'clip-video',
        {
          analysisResult: { _id: String(analysisResult._id) },
          maxClips: clippingOptions.maxClips,
          minScoreThreshold: clippingOptions.minScoreThreshold,
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
        `Auto-clipping job queued successfully for analysis: ${analysisResult._id} with ${highValueSegments.length} high-value segments`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue auto-clipping job for analysis: ${analysisResult._id}`,
        getErrorMessage(error),
      );
      // Don't throw the error - we don't want to fail the analysis if clipping fails
    }
  }

  private async updateProcessingStatus(
    processingId: string,
    status: string,
    message?: string,
  ): Promise<void> {
    try {
      await this.processingHistoryModel.updateOne(
        { _id: processingId },
        {
          processingStatus: status,
          ...(status === 'completed' && {
            processingCompletedAt: new Date(),
          }),
          ...(status === 'failed' && {
            errorDetails: {
              stage: 'analysis',
              message: message || 'Unknown error',
            },
          }),
        },
      );
    } catch (error) {
      this.logger.error(
        'Failed to update processing status',
        getErrorMessage(error),
      );
    }
  }
}
