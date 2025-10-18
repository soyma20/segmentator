import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

import { FfmpegService } from '../../services/ffmpeg/ffmpeg.service';
import { AnalysisResult } from '../../analysis/schemas/analysis.schema';
import { ProcessingHistory } from '../../processing/schemas/processing-history.schema';
import { File } from '../../files/schemas/file.schema';
import { VideoClip as VideoClipSchema } from '../../processing/schemas/video-clip.schema';
import { getErrorMessage } from '../../common/utils/error.utils';
import { stat } from 'fs/promises';

export interface ClippingJobData {
  analysisResult: {
    _id: string;
  };
  maxClips?: number;
  minScoreThreshold?: number;
}

export interface ClippingJobResult {
  analysisId: string;
  clipsCreated: number;
  clipPaths: string[];
  status: 'completed' | 'failed';
  error?: string;
}

export interface OptimizedSegment {
  _id: string;
  startTime: string;
  endTime: string;
  duration: number;
  combinedSegmentIds: string[];
  aggregatedScore: number;
  finalTitle: string;
  finalSummary: string;
  finalKeyTopics: string[];
  extractionPriority: number;
  rank: number;
}

@Processor('clipping')
@Injectable()
export class ClippingProcessor extends WorkerHost {
  private readonly logger = new Logger(ClippingProcessor.name);

  constructor(
    private readonly ffmpegService: FfmpegService,
    @InjectModel(AnalysisResult.name)
    private analysisResultModel: Model<AnalysisResult>,
    @InjectModel(ProcessingHistory.name)
    private processingHistoryModel: Model<ProcessingHistory>,
    @InjectModel(File.name)
    private fileModel: Model<File>,
    @InjectModel(VideoClipSchema.name)
    private videoClipModel: Model<VideoClipSchema>,
  ) {
    super();
  }

  async process(job: Job<ClippingJobData>): Promise<ClippingJobResult> {
    const { analysisResult, maxClips = 10, minScoreThreshold = 6 } = job.data;
    const analysisId = analysisResult._id;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new Error(
        `Invalid analysis ID format: ${analysisId}. Must be a valid MongoDB ObjectId.`,
      );
    }

    this.logger.log(
      `Starting clipping job for analysis: ${analysisId}, maxClips: ${maxClips}, minScore: ${minScoreThreshold}`,
    );

    try {
      // Step 1: Get analysis result with optimized segments
      const analysisRecord = await this.analysisResultModel
        .findById(analysisId)
        .exec();

      if (!analysisRecord) {
        throw new Error(`Analysis result not found: ${analysisId}`);
      }

      // Step 2: Get processing history and original file
      const processingHistory = await this.processingHistoryModel
        .findById(analysisRecord.processingId)
        .exec();

      if (!processingHistory) {
        throw new Error(
          `Processing history not found for processing ID: ${String(analysisRecord.processingId)}`,
        );
      }

      const originalFile = await this.fileModel
        .findById(analysisRecord.fileId)
        .exec();

      if (!originalFile) {
        throw new Error(
          `Original file not found: ${String(analysisRecord.fileId)}`,
        );
      }

      // Step 3: Update processing status
      await this.updateProcessingStatus(
        String(processingHistory._id),
        'clipping',
        'Video clipping started',
      );

      // Step 4: Filter and prepare segments for clipping
      const segmentsToClip = this.prepareSegmentsForClipping(
        analysisRecord.optimizedSegments,
        maxClips,
        minScoreThreshold,
      );

      if (segmentsToClip.length === 0) {
        this.logger.warn('No segments meet the criteria for clipping');
        await this.updateProcessingStatus(
          String(processingHistory._id),
          'clipping',
          'No segments to clip',
        );
        return {
          analysisId,
          clipsCreated: 0,
          clipPaths: [],
          status: 'completed',
        };
      }

      // Step 5: Create output directory structure
      const clipsDir = this.createClipsDirectory(originalFile.originalName);
      await this.ffmpegService.ensureDir(clipsDir);

      // Step 6: Generate video clips
      const clips = await this.generateVideoClips(
        originalFile.filePath,
        segmentsToClip,
        clipsDir,
        String(analysisRecord.fileId),
        analysisId,
      );

      // Step 7: Update processing status
      await this.updateProcessingStatus(
        String(processingHistory._id),
        'clipping',
        `Video clipping completed. Created ${clips.length} clips.`,
      );

      this.logger.log(
        `Clipping completed successfully. Created ${clips.length} video clips`,
      );

      return {
        analysisId,
        clipsCreated: clips.length,
        clipPaths: clips.map((clip) => clip.clipPath),
        status: 'completed',
      };
    } catch (error) {
      this.logger.error(
        `Clipping job failed for analysis ${analysisId}:`,
        getErrorMessage(error),
      );

      // Update processing status to failed
      try {
        const analysisRecord = await this.analysisResultModel
          .findById(analysisId)
          .exec();
        if (analysisRecord) {
          const processingHistory = await this.processingHistoryModel
            .findById(analysisRecord.processingId)
            .exec();
          if (processingHistory) {
            await this.updateProcessingStatus(
              String(processingHistory._id),
              'clipping',
              `Video clipping failed: ${getErrorMessage(error)}`,
            );
          }
        }
      } catch (updateError) {
        this.logger.error('Failed to update processing status:', updateError);
      }

      return {
        analysisId,
        clipsCreated: 0,
        clipPaths: [],
        status: 'failed',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Prepares segments for clipping based on criteria
   */
  private prepareSegmentsForClipping(
    optimizedSegments: OptimizedSegment[],
    maxClips: number,
    minScoreThreshold: number,
  ): OptimizedSegment[] {
    // Filter segments by score threshold
    const filteredSegments = optimizedSegments.filter(
      (segment) => segment.aggregatedScore >= minScoreThreshold,
    );

    // Sort by extraction priority (already sorted by rank, but ensure priority order)
    const sortedSegments = filteredSegments.sort(
      (a, b) => b.extractionPriority - a.extractionPriority,
    );

    // Take only the top segments up to maxClips
    return sortedSegments.slice(0, maxClips);
  }

  /**
   * Creates directory structure for video clips
   */
  private createClipsDirectory(originalFilename: string): string {
    const baseName = originalFilename.replace(/\.[^/.]+$/, ''); // Remove extension
    const clipsDir = join(process.cwd(), 'uploads', 'clips', baseName);
    return clipsDir;
  }

  /**
   * Generates video clips from optimized segments
   */
  private async generateVideoClips(
    originalFilePath: string,
    segments: OptimizedSegment[],
    outputDir: string,
    fileId: string,
    analysisId: string,
  ): Promise<VideoClipSchema[]> {
    const clips: VideoClipSchema[] = [];
    const timecodes = segments.map((segment) => ({
      start: segment.startTime,
      end: segment.endTime,
    }));

    // Debug logging to see what time values we're working with
    this.logger.log(`Generating clips for ${segments.length} segments:`);
    segments.forEach((segment, index) => {
      this.logger.log(
        `Segment ${index + 1}: ${segment.startTime} - ${segment.endTime} (duration: ${segment.duration}s)`,
      );
    });

    // Generate output pattern for clips
    const outputPattern = join(outputDir, `clip_%i.mp4`);

    try {
      // Use FFmpeg service to cut the video
      const clipPaths = await this.ffmpegService.cutMediaByTimecodes(
        originalFilePath,
        timecodes,
        outputPattern,
      );

      // Create clip metadata and save to database
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const clipPath = clipPaths[i];

        if (clipPath) {
          // Get file stats
          const fileStats = await stat(clipPath);

          const clipData = {
            analysisId: analysisId,
            originalFileId: fileId,
            clipId: uuidv4(),
            originalSegmentId: segment._id,
            startTime: segment.startTime,
            endTime: segment.endTime,
            duration: segment.duration,
            title: segment.finalTitle,
            summary: segment.finalSummary,
            score: segment.aggregatedScore,
            rank: segment.rank,
            clipPath: clipPath,
            fileSize: fileStats.size,
            mimeType: 'video/mp4',
            status: 'active' as const,
          };

          // Save to database
          const savedClip = await this.videoClipModel.create(clipData);
          clips.push(savedClip);
        }
      }

      return clips;
    } catch (error) {
      this.logger.error('Failed to generate video clips:', error);
      throw error;
    }
  }

  /**
   * Updates processing status in the database
   */
  private async updateProcessingStatus(
    processingId: string,
    stage: string,
    message: string,
  ): Promise<void> {
    try {
      await this.processingHistoryModel.findByIdAndUpdate(
        processingId,
        {
          $set: {
            [`processing_metrics.${stage}`]: {
              status: stage === 'clipping' ? 'completed' : 'in_progress',
              message,
              timestamp: new Date(),
            },
          },
        },
        { new: true },
      );
    } catch (error) {
      this.logger.error('Failed to update processing status:', error);
    }
  }
}
