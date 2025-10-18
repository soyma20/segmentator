import {
  Controller,
  Post,
  Body,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { File } from '../files/schemas/file.schema';
import { ProcessingHistory } from '../processing/schemas/processing-history.schema';
import { TranscriptionJobData } from '../common/interfaces/transcription-job.interface';
import { TriggerTranscriptionDto } from './dto/trigger-transcription.dto';

@Controller('transcription')
export class TranscriptionController {
  private readonly logger = new Logger(TranscriptionController.name);

  constructor(
    @InjectQueue('transcription')
    private transcriptionQueue: Queue<TranscriptionJobData>,
    @InjectModel(File.name)
    private fileModel: Model<File>,
    @InjectModel(ProcessingHistory.name)
    private processingHistoryModel: Model<ProcessingHistory>,
  ) {}

  @Post('trigger')
  async triggerTranscription(@Body() dto: TriggerTranscriptionDto) {
    this.logger.log(`Triggering transcription for file: ${dto.fileId}`);

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(dto.fileId)) {
      throw new HttpException(
        `Invalid file ID format: ${dto.fileId}. Must be a valid MongoDB ObjectId.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Fetch file data
      const file = await this.fileModel.findById(dto.fileId).exec();
      if (!file) {
        throw new HttpException(
          `File not found: ${dto.fileId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Fetch processing history (optional - may not exist for all files)
      const processingHistory = await this.processingHistoryModel
        .findOne({ fileId: dto.fileId })
        .exec();

      // Use provided language code or default to 'en'
      const languageCode = dto.languageCode || 'en';

      // Prepare transcription job data
      const jobData: TranscriptionJobData = {
        fileId: dto.fileId,
        filePath: file.filePath,
        originalName: file.originalName,
        mimeType: file.mimeType,
        duration: file.duration,
        languageCode: languageCode,
        processingId: processingHistory
          ? String(processingHistory._id)
          : undefined,
      };

      // Queue transcription job
      await this.transcriptionQueue.add('transcribe-file', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      });

      this.logger.log(
        `Transcription job queued successfully for file: ${file.originalName} (ID: ${dto.fileId})`,
      );

      return {
        message: 'Transcription job queued successfully',
        fileId: dto.fileId,
        fileName: file.originalName,
        languageCode: languageCode,
        hasProcessingHistory: !!processingHistory,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to queue transcription job for file: ${dto.fileId}`,
        errorMessage,
      );

      throw new HttpException(
        `Failed to queue transcription job: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
