import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TranscriptionService } from '../transcription.service';
import {
  TranscriptionJobData,
  TranscriptionJobResult,
} from 'src/common/interfaces/transcription-job.interface';
import { GoogleSpeechService } from 'src/external-apis/google-speech/google-speech.service';
import { FfmpegService } from 'src/services/ffmpeg/ffmpeg.service';
import { getErrorMessage } from 'src/common/utils/error.utils';

interface TranscriptionRecord {
  _id: string;
}

@Processor('transcription')
@Injectable()
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly googleSpeechService: GoogleSpeechService,
    private readonly ffmpegService: FfmpegService,
    @InjectQueue('analysis') private analysisQueue: Queue,
  ) {
    super();
  }

  async process(
    job: Job<TranscriptionJobData>,
  ): Promise<TranscriptionJobResult> {
    const { fileId, filePath, originalName, mimeType, duration } = job.data;

    this.logger.log(
      `Starting transcription job for file: ${originalName} (ID: ${fileId})`,
    );

    try {
      // Step 1: Convert video to audio if needed
      let audioFilePath = filePath;
      if (this.isVideoFile(mimeType)) {
        this.logger.log(`Converting video to audio: ${originalName}`);
        const audioOutputPath = filePath.replace(/\.[^/.]+$/, '.wav');
        audioFilePath = await this.ffmpegService.convertVideoToAudio(
          filePath,
          audioOutputPath,
        );
      }

      // Step 2: Transcribe and segment audio
      this.logger.log(`Starting transcription: ${originalName}`);
      const segments = await this.googleSpeechService.transcribeAndSegmentAudio(
        audioFilePath,
        'uk-UA',
        16000,
        60,
      );

      // Step 3: Save transcription to database
      const transcription =
        (await this.transcriptionService.createTranscription({
          fileId,
          segments,
          duration,
          language: 'uk-UA',
        })) as TranscriptionRecord;

      // Step 4: Queue analysis job
      await this.queueAnalysisJob(transcription);

      this.logger.log(
        `Transcription completed successfully for file: ${originalName}`,
      );

      return {
        fileId,
        transcriptionId: transcription._id,
        status: 'completed',
      };
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      this.logger.error(
        `Transcription failed for file: ${originalName}`,
        errorMessage,
      );

      try {
        const failedTranscription =
          (await this.transcriptionService.createFailedTranscription({
            fileId,
            error: errorMessage,
          })) as { _id: string };

        return {
          fileId,
          transcriptionId: failedTranscription._id,
          status: 'failed',
          error: errorMessage,
        };
      } catch (saveErr: unknown) {
        const saveErrorMessage = getErrorMessage(saveErr);
        this.logger.error(
          'Failed to save error transcription record',
          saveErrorMessage,
        );

        return {
          fileId,
          transcriptionId: '',
          status: 'failed',
          error: errorMessage,
        };
      }
    }
  }

  private async queueAnalysisJob(
    transcription: TranscriptionRecord,
  ): Promise<void> {
    try {
      const job = await this.analysisQueue.add(
        'analyze-segments',
        { transcription },
        {
          priority: 1,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );

      this.logger.log(
        `Analysis job queued: ${job.id} for transcription: ${transcription._id}`,
      );
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      this.logger.error('Failed to queue analysis job', errorMessage);
      // Don't throw here - transcription was successful
    }
  }

  private isVideoFile(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }
}
