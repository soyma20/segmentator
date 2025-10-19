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
  maxCombinedDuration?: number;
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
    const {
      analysisResult,
      maxClips = 10,
      minScoreThreshold = 6,
      maxCombinedDuration,
    } = job.data;
    const analysisId = analysisResult._id;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new Error(
        `Invalid analysis ID format: ${analysisId}. Must be a valid MongoDB ObjectId.`,
      );
    }

    this.logger.log(
      `Starting clipping job for analysis: ${analysisId}, maxClips: ${maxClips}, minScore: ${minScoreThreshold}, maxCombinedDuration: ${maxCombinedDuration || 'from config'}`,
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

      // Step 4: Re-optimize segments if maxCombinedDuration override is provided
      let segmentsToUse = analysisRecord.optimizedSegments;
      if (maxCombinedDuration !== undefined) {
        this.logger.log(
          `Re-optimizing segments with override maxCombinedDuration: ${maxCombinedDuration}s`,
        );
        segmentsToUse = this.reoptimizeSegmentsWithDuration(
          analysisRecord.optimizedSegments,
          maxCombinedDuration,
        );
      }

      // Step 5: Filter and prepare segments for clipping
      const segmentsToClip = this.prepareSegmentsForClipping(
        segmentsToUse,
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
  /**
   * Re-optimizes segments with a new maxCombinedDuration constraint
   * This allows overriding the original analysis configuration
   */
  private reoptimizeSegmentsWithDuration(
    optimizedSegments: OptimizedSegment[],
    maxCombinedDuration: number,
  ): OptimizedSegment[] {
    this.logger.log(
      `Re-optimizing ${optimizedSegments.length} segments with maxCombinedDuration: ${maxCombinedDuration}s`,
    );

    const reoptimized: OptimizedSegment[] = [];
    let currentGroup: OptimizedSegment[] = [];

    for (let i = 0; i < optimizedSegments.length; i++) {
      const segment = optimizedSegments[i];

      if (
        this.shouldCombineSegment(segment, currentGroup, maxCombinedDuration)
      ) {
        currentGroup.push(segment);
        this.logger.log(
          `Added segment ${segment._id} to group. Group size: ${currentGroup.length}`,
        );
      } else {
        // Process the current group if it's not empty
        if (currentGroup.length > 0) {
          const combined = this.combineOptimizedSegments(currentGroup);
          reoptimized.push(combined);
          this.logger.log(
            `Created re-optimized segment with ${currentGroup.length} segments, duration: ${combined.duration}s`,
          );
        }
        // Start a new group with the current segment
        currentGroup = [segment];
        this.logger.log(`Started new group with segment ${segment._id}`);
      }
    }

    // Process the last group if it exists
    if (currentGroup.length > 0) {
      const combined = this.combineOptimizedSegments(currentGroup);
      reoptimized.push(combined);
      this.logger.log(
        `Created final re-optimized segment with ${currentGroup.length} segments, duration: ${combined.duration}s`,
      );
    }

    this.logger.log(
      `Re-optimization complete. Created ${reoptimized.length} segments from ${optimizedSegments.length} original segments`,
    );
    return reoptimized;
  }

  /**
   * Determines if a segment should be combined with the current group based on duration constraint
   */
  private shouldCombineSegment(
    segment: OptimizedSegment,
    currentGroup: OptimizedSegment[],
    maxCombinedDuration: number,
  ): boolean {
    if (currentGroup.length === 0) {
      return true; // Always start with the first segment
    }

    // Calculate total duration if we add this segment
    const currentDuration = this.calculateOptimizedGroupDuration(currentGroup);
    const newTotalDuration = currentDuration + segment.duration;

    if (newTotalDuration > maxCombinedDuration) {
      this.logger.log(
        `Not combining segment ${segment._id}: would exceed max duration (${newTotalDuration}s > ${maxCombinedDuration}s)`,
      );
      return false;
    }

    return true;
  }

  /**
   * Calculates the total duration of a group of optimized segments
   */
  private calculateOptimizedGroupDuration(
    segments: OptimizedSegment[],
  ): number {
    if (segments.length === 0) return 0;
    return segments.reduce((total, segment) => total + segment.duration, 0);
  }

  /**
   * Combines multiple optimized segments into a single segment
   */
  private combineOptimizedSegments(
    segments: OptimizedSegment[],
  ): OptimizedSegment {
    if (segments.length === 1) {
      return segments[0];
    }

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    // Calculate combined duration
    const totalDuration = this.calculateOptimizedGroupDuration(segments);

    // Calculate weighted average score
    const totalScore = segments.reduce(
      (sum, segment) => sum + segment.aggregatedScore * segment.duration,
      0,
    );
    const weightedScore = totalScore / totalDuration;

    // Combine all segment IDs
    const combinedSegmentIds = segments.flatMap(
      (segment) => segment.combinedSegmentIds,
    );

    // Combine titles and summaries
    const combinedTitle = segments.map((s) => s.finalTitle).join(' | ');
    const combinedSummary = segments.map((s) => s.finalSummary).join(' ');

    // Combine key topics (remove duplicates)
    const allKeyTopics = segments.flatMap((s) => s.finalKeyTopics);
    const uniqueKeyTopics = Array.from(new Set(allKeyTopics));

    return {
      _id: `${firstSegment._id}_combined_${segments.length}`,
      startTime: firstSegment.startTime,
      endTime: lastSegment.endTime,
      duration: totalDuration,
      combinedSegmentIds,
      aggregatedScore: weightedScore,
      finalTitle: combinedTitle,
      finalSummary: combinedSummary,
      finalKeyTopics: uniqueKeyTopics,
      extractionPriority: Math.max(
        ...segments.map((s) => s.extractionPriority),
      ),
      rank: Math.min(...segments.map((s) => s.rank)),
    };
  }

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
