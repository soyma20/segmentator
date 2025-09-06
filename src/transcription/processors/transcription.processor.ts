import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { TranscriptionService } from '../transcription.service';
import {
  TranscriptionJobData,
  TranscriptionJobResult,
} from 'src/common/interfaces/transcription-job.interface';

@Processor('transcription')
@Injectable()
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  constructor(private readonly transcriptionService: TranscriptionService) {
    super();
  }

  async process(
    job: Job<TranscriptionJobData>,
  ): Promise<TranscriptionJobResult> {
    const { fileId, originalName } = job.data;

    this.logger.log(
      `Processing transcription for file: ${originalName} (ID: ${fileId})`,
    );

    try {
      // Update job progress
      await job.updateProgress(10);

      // Process the transcription
      const transcription =
        await this.transcriptionService.processTranscription(job.data);

      await job.updateProgress(100);

      this.logger.log(`Transcription completed for file: ${originalName}`);

      return {
        fileId,
        transcriptionId: transcription._id?.toString() || '',
        status: 'completed',
      };
    } catch (error) {
      this.logger.error(
        `Transcription failed for file: ${originalName}`,
        error,
      );

      return {
        fileId,
        transcriptionId: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
