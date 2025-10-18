import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Transcription,
  TranscriptionStatus,
} from './schemas/transcription.schema';
import { TranscriptionSegment } from './schemas/transcription-segment.schema';
import { TranscriptionProvider } from 'src/common/enums/transcription-provider.enum';
import { v4 as uuidv4 } from 'uuid';

interface CreateTranscriptionData {
  fileId: string;
  segments: TranscriptionSegment[];
  duration: number;
  language: string;
  processingId?: string;
}

interface CreateFailedTranscriptionData {
  fileId: string;
  error: string;
  processingId?: string;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    @InjectModel(Transcription.name)
    private transcriptionModel: Model<Transcription>,
    @InjectModel(TranscriptionSegment.name)
    private segmentModel: Model<TranscriptionSegment>,
  ) {}

  async createTranscription(
    data: CreateTranscriptionData,
  ): Promise<Transcription> {
    const { fileId, segments, language, processingId } = data;

    try {
      console.log('Creating transcription with segments:', segments);

      // Process segments and calculate additional fields
      const processedSegments = segments.map((segment, index) => ({
        _id: uuidv4(),
        startTime: this.secondsToTimeString(segment.startSeconds),
        endTime: this.secondsToTimeString(segment.endSeconds),
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        duration: segment.endSeconds - segment.startSeconds,
        text: segment.text || '[No speech detected]', // Ensure text is never empty
        wordCount: this.countWords(segment.text || ''),
        avgConfidence: segment.avgConfidence || 0.0, // Default confidence
        speakerChange:
          index === 0 || this.detectSpeakerChange(segments[index - 1], segment),
      }));

      // Calculate overall statistics
      const totalWords = processedSegments.reduce(
        (sum, segment) => sum + segment.wordCount,
        0,
      );
      console.log('Total words calculated:', totalWords);

      const totalSegments = processedSegments.length;

      const fullText = processedSegments
        .map((segment) => segment.text)
        .filter((text) => text && text !== '[No speech detected]') // Filter out placeholder text
        .join(' ')
        .trim();

      // Ensure fullText is never empty for validation
      const finalFullText = fullText || '[No speech detected in audio]';
      console.log('Full transcription text:', finalFullText);

      const avgConfidence =
        processedSegments.length > 0
          ? processedSegments.reduce(
              (sum, segment) => sum + segment.avgConfidence,
              0,
            ) / processedSegments.length
          : 0;

      const transcription = new this.transcriptionModel({
        fileId: new Types.ObjectId(fileId),
        processingId: processingId
          ? new Types.ObjectId(processingId)
          : undefined,
        transcriptionProvider: TranscriptionProvider.GOOGLE_SPEECH,
        language: language || 'en', // Use shorter language code to avoid MongoDB issues
        confidence: avgConfidence,
        segments: processedSegments,
        totalSegments,
        totalWords,
        fullText: finalFullText,
        status: TranscriptionStatus.COMPLETED,
        completedAt: new Date(),
      });

      const savedTranscription = await transcription.save();
      this.logger.log(
        `Transcription created successfully: ${(savedTranscription._id as Types.ObjectId).toString()}`,
      );
      return savedTranscription;
    } catch (error) {
      this.logger.error('Failed to create transcription:', error);
      throw error;
    }
  }

  async createFailedTranscription(
    data: CreateFailedTranscriptionData,
  ): Promise<Transcription> {
    const { fileId, error, processingId } = data;

    try {
      const transcription = new this.transcriptionModel({
        fileId: new Types.ObjectId(fileId),
        processingId: processingId
          ? new Types.ObjectId(processingId)
          : undefined,
        transcriptionProvider: TranscriptionProvider.GOOGLE_SPEECH,
        language: 'en', // Use simple language code to avoid MongoDB issues
        confidence: 0,
        segments: [],
        totalSegments: 0,
        totalWords: 0,
        fullText: `Transcription failed: ${error}`, // Provide non-empty fullText
        status: TranscriptionStatus.FAILED,
        error,
        completedAt: new Date(),
      });

      const savedTranscription = await transcription.save();
      this.logger.log(
        `Failed transcription record created: ${(savedTranscription._id as Types.ObjectId).toString()}`,
      );

      return savedTranscription;
    } catch (saveError) {
      this.logger.error('Failed to save failed transcription:', saveError);
      throw saveError;
    }
  }

  async getTranscriptionByFileId(
    fileId: string,
  ): Promise<Transcription | null> {
    return this.transcriptionModel
      .findOne({ fileId: new Types.ObjectId(fileId) })
      .exec();
  }

  async getTranscriptionById(
    transcriptionId: string,
  ): Promise<Transcription | null> {
    return this.transcriptionModel.findById(transcriptionId).exec();
  }

  async updateTranscriptionStatus(
    transcriptionId: string,
    status: TranscriptionStatus,
    error?: string,
  ): Promise<void> {
    await this.transcriptionModel
      .updateOne(
        { _id: transcriptionId },
        {
          status,
          error,
          ...(status === TranscriptionStatus.COMPLETED && {
            completedAt: new Date(),
          }),
        },
      )
      .exec();
  }

  private countWords(text: string): number {
    if (!text || text === '[No speech detected]') {
      return 0;
    }
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  private secondsToTimeString(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private detectSpeakerChange(
    prevSegment: TranscriptionSegment,
    currentSegment: TranscriptionSegment,
  ): boolean {
    // Simple heuristic for speaker change detection
    // This can be enhanced with more sophisticated logic
    const timeBetween = currentSegment.startSeconds - prevSegment.endSeconds;

    // If there's a significant pause (>2 seconds), assume speaker change
    if (timeBetween > 2) {
      return true;
    }

    // Check for dramatic confidence changes (might indicate different speaker)
    const confidenceDiff = Math.abs(
      currentSegment.avgConfidence - prevSegment.avgConfidence,
    );
    if (confidenceDiff > 0.3) {
      return true;
    }

    return false;
  }
}
