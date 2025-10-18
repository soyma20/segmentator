import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as ffmpeg from 'fluent-ffmpeg';

import { File } from './schemas/file.schema';
import { StorageType } from 'src/common/enums/storage-type.enum';
import { FileOperationException } from 'src/common/exceptions/file-operation.exception';
import { getErrorMessage, isNodeError } from 'src/common/utils/error.utils';
import { TranscriptionJobData } from 'src/common/interfaces/transcription-job.interface';
import { MIMES } from 'src/common/constants/mimes.constant';
import { UploadFileDto } from './dto/upload-file.dto';
import { ProcessingHistory } from 'src/processing/schemas/processing-history.schema';
import { ProcessingStatus } from 'src/common/enums/processing-status.enum';
import { VideoType } from 'src/common/enums/video-type.enum';
import { StorageService } from 'src/common/providers/storage/storage.service';

type VideoMetadata = {
  duration: number;
  format: string;
  videoCodec?: string;
  audioCodec?: string;
  resolution: { width?: number; height?: number } | null;
  bitrate: number | null;
  frameRate: number | null;
} | null;
@Injectable()
export class FilesService {
  constructor(
    @InjectModel(File.name) private fileModel: Model<File>,
    @InjectModel(ProcessingHistory.name)
    private processingHistoryModel: Model<ProcessingHistory>,
    @InjectQueue('transcription') private transcriptionQueue: Queue,
    private readonly storageService: StorageService,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    uploadData: UploadFileDto,
  ): Promise<{ file: File; processingHistory?: ProcessingHistory }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!uploadData.languageCode) {
      throw new BadRequestException('Language code is required');
    }

    try {
      // Use storage service to upload file
      const uploadResult = await this.storageService.uploadFile(file);

      const metadata: VideoMetadata = this.isVideoFile(file.mimetype)
        ? await this.getVideoMetadata(uploadResult.filePath)
        : null;

      const fileRecord = new this.fileModel({
        originalName: file.originalname,
        storedName: path.basename(uploadResult.filePath),
        filePath: uploadResult.filePath,
        storageType: StorageType.LOCAL, // This will be determined by the storage service
        mimeType: file.mimetype,
        fileSize: file.size,
        duration: metadata?.duration || 0,
        format: metadata?.format || this.getFileFormat(file.originalname),
        videoCodec: metadata?.videoCodec,
        audioCodec: metadata?.audioCodec,
        resolution: metadata?.resolution,
        bitrate: metadata?.bitrate,
        frameRate: metadata?.frameRate,
        uploadedAt: new Date(),
        totalProcessingRuns: 0,
      });

      const savedFile = await fileRecord.save();

      let processingHistory: ProcessingHistory | undefined;

      if (this.isTranscribableFile(file.mimetype)) {
        // Create processing history if configuration is provided
        if (uploadData.processingConfiguration) {
          processingHistory = await this.createProcessingHistory(
            String(savedFile._id),
            uploadData.processingConfiguration,
          );
        }

        await this.queueTranscriptionJob(
          savedFile,
          uploadData.languageCode,
          processingHistory ? String(processingHistory._id) : undefined,
        );
      }

      return { file: savedFile, processingHistory };
    } catch (error: unknown) {
      // Clean up uploaded file if database operation fails
      try {
        await this.storageService.deleteFile(file.originalname);
      } catch (cleanupError) {
        console.warn('Failed to cleanup file after error:', cleanupError);
      }

      if (error instanceof Error && error.name === 'ValidationError') {
        throw new BadRequestException(
          `File validation failed: ${error.message}`,
        );
      }

      throw new FileOperationException(
        'File upload failed',
        'upload',
        file.originalname,
        error,
      );
    }
  }

  private async createProcessingHistory(
    fileId: string,
    config: NonNullable<UploadFileDto['processingConfiguration']>,
  ): Promise<ProcessingHistory> {
    const processingHistory = new this.processingHistoryModel({
      fileId: fileId,
      processingStartedAt: new Date(),
      processingStatus: ProcessingStatus.PENDING,
      configuration: {
        segmentDuration: config.segmentDuration,
        llmProvider: config.llmProvider,
        llmModel: config.llmModel,
        analysisConfig: config.analysisConfig || {
          videoType: VideoType.GENERAL,
          focusAreas: [],
          targetAudience: 'General audience',
          minInformativenessScore: 0.5,
          maxCombinedDuration: 300,
        },
        clippingConfig: config.clippingConfig || {
          maxClips: 10,
          minScoreThreshold: 5,
        },
      },
      processing_metrics: {},
    });

    return await processingHistory.save();
  }

  private async queueTranscriptionJob(
    file: File,
    languageCode: string,
    processingId?: string,
  ): Promise<void> {
    try {
      const jobData: TranscriptionJobData = {
        fileId: file._id?.toString() || '',
        filePath: file.filePath,
        originalName: file.originalName,
        mimeType: file.mimeType,
        duration: file.duration,
        languageCode: languageCode,
        processingId: processingId,
        priority: this.getJobPriority(file.duration),
      };

      await this.transcriptionQueue.add('process-transcription', jobData, {
        priority: jobData.priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      });
    } catch (error: unknown) {
      console.error(
        'Failed to queue transcription job:',
        getErrorMessage(error),
      );
      // Don't throw here - file upload was successful, transcription is secondary
    }
  }

  private getJobPriority(duration: number): number {
    // Shorter files get higher priority (lower number = higher priority)
    if (duration < 60) return 1; // Less than 1 minute
    if (duration < 300) return 5; // Less than 5 minutes
    if (duration < 1800) return 10; // Less than 30 minutes
    return 15; // 30+ minutes
  }

  private isTranscribableFile(mimeType: string): boolean {
    return MIMES.includes(mimeType);
  }

  private async safeDeleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (unlinkError: unknown) {
      console.warn(
        'Failed to delete file after DB error:',
        getErrorMessage(unlinkError),
      );
    }
  }

  private isVideoFile(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  private getFileFormat(filename: string): string {
    return path.extname(filename).slice(1).toLowerCase();
  }

  private async getVideoMetadata(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.warn('Failed to get video metadata:', getErrorMessage(err));
          resolve(null);
          return;
        }

        try {
          const videoStream = metadata.streams?.find(
            (s) => s.codec_type === 'video',
          );
          const audioStream = metadata.streams?.find(
            (s) => s.codec_type === 'audio',
          );

          resolve({
            duration: metadata.format?.duration || 0,
            format: metadata.format?.format_name?.split(',')[0] || 'unknown',
            videoCodec: videoStream?.codec_name,
            audioCodec: audioStream?.codec_name,
            resolution: videoStream
              ? {
                  width: videoStream.width,
                  height: videoStream.height,
                }
              : null,
            bitrate: metadata.format?.bit_rate
              ? metadata.format.bit_rate
              : null,
            frameRate: videoStream?.r_frame_rate
              ? this.parseFrameRate(videoStream.r_frame_rate)
              : null,
          });
        } catch (parseError: unknown) {
          console.warn(
            'Failed to parse video metadata:',
            getErrorMessage(parseError),
          );
          resolve(null);
        }
      });
    });
  }

  private parseFrameRate(frameRateString: string): number | null {
    if (!frameRateString) return null;
    const [num, den] = frameRateString.split('/').map(Number);
    return den ? Math.round(num / den) : num;
  }

  async getFileById(id: string): Promise<File> {
    try {
      const file = await this.fileModel.findById(id).exec();
      if (!file) {
        throw new BadRequestException('File not found');
      }
      return file;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve file');
    }
  }

  async deleteFile(id: string): Promise<void> {
    try {
      const file = await this.fileModel.findById(id);
      if (!file) {
        throw new BadRequestException('File not found');
      }

      await this.safeDeleteFile(file.filePath);

      await this.fileModel.findByIdAndDelete(id);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new FileOperationException(
        'Failed to delete file',
        'delete',
        undefined,
        error,
      );
    }
  }

  async getAllFiles(): Promise<File[]> {
    try {
      return await this.fileModel.find().sort({ uploadedAt: -1 }).exec();
    } catch (error: unknown) {
      throw new InternalServerErrorException(
        `Failed to retrieve files: ${getErrorMessage(error)}`,
      );
    }
  }
}
