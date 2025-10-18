import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AnalysisService } from '../analysis.service';
import { TranscriptionService } from '../../transcription/transcription.service';
import { ProcessingHistory } from '../../processing/schemas/processing-history.schema';
import { Transcription } from '../../transcription/schemas/transcription.schema';
import { AnalysisResult } from '../schemas/analysis.schema';
import { getErrorMessage } from '../../common/utils/error.utils';

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
