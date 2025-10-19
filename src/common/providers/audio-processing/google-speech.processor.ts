import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechClient } from '@google-cloud/speech';
import { google } from '@google-cloud/speech/build/protos/protos';
import { Storage } from '@google-cloud/storage';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptionSegment } from '../../../transcription/schemas/transcription-segment.schema';
import {
  IAudioProcessor,
  AudioProcessingConfig,
} from '../../interfaces/audio-processing.interface';

@Injectable()
export class GoogleSpeechProcessor implements IAudioProcessor {
  private readonly speechClient: SpeechClient;
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.speechClient = new SpeechClient();
    this.storage = new Storage();
    this.bucketName = this.configService.get<string>(
      'GOOGLE_TRANSCRIPTION_UPLOAD_BUCKET',
      '',
    );
  }

  async transcribeAndSegmentAudio(
    filePath: string,
    config: AudioProcessingConfig,
  ): Promise<TranscriptionSegment[]> {
    const {
      languageCode,
      sampleRateHertz = 16000,
      segmentLength = 60,
    } = config;

    try {
      // Upload file to GCS
      const gcsUri = await this.uploadToGcs(filePath);

      // Transcribe audio
      const response = await this.transcribeAudioFromGcs(
        gcsUri,
        sampleRateHertz,
        languageCode,
      );

      // Get audio duration (simplified - you might want to get this from metadata)
      const audioDuration = 0; // This should be calculated from the actual audio file

      // Create segments
      const segments = this.createSegmentsFromResponse(
        response,
        audioDuration,
        segmentLength,
      );

      // Clean up GCS file
      await this.deleteFromGcs(gcsUri);

      return segments;
    } catch (error) {
      throw new Error(
        `Google Speech transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async uploadToGcs(filePath: string): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const fileName = `temp-${randomUUID()}.wav`;
    const file = bucket.file(fileName);

    await file.save(await fs.readFile(filePath));
    return `gs://${this.bucketName}/${fileName}`;
  }

  private async deleteFromGcs(gcsUri: string): Promise<void> {
    const fileName = gcsUri.split('/').pop();
    if (!fileName) return;

    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);

    try {
      await file.delete();
    } catch {
      // Ignore deletion errors
    }
  }

  private async transcribeAudioFromGcs(
    gcsUri: string,
    sampleRateHertz: number,
    languageCode: string,
  ): Promise<google.cloud.speech.v1.ILongRunningRecognizeResponse> {
    const audio = { uri: gcsUri };
    const config = {
      encoding: 'LINEAR16' as const,
      sampleRateHertz,
      languageCode,
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
      model: 'default',
    };

    const [operation] = await this.speechClient.longRunningRecognize({
      audio,
      config,
    });

    const [response] = await operation.promise();
    return response;
  }

  private createSegmentsFromResponse(
    response: google.cloud.speech.v1.IRecognizeResponse,
    audioDuration: number,
    segmentLength: number,
    timeOffset: number = 0,
  ): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    const results = response.results || [];

    for (const result of results) {
      const alternatives = result.alternatives || [];
      if (alternatives.length === 0) continue;

      const alternative = alternatives[0];
      const words = alternative.words || [];

      if (words.length === 0) continue;

      let segmentWords: any[] = [];
      let segmentStartTime = 0;

      for (const word of words) {
        const startTime = Number(word.startTime?.seconds || 0);
        const endTime = Number(word.endTime?.seconds || 0);
        const confidence = word.confidence || 0;

        if (segmentWords.length === 0) {
          segmentStartTime = startTime;
        }

        segmentWords.push({
          word: word.word,
          startTime,
          endTime,
          confidence,
        });

        // Check if we should end this segment
        const segmentDuration = endTime - segmentStartTime;
        if (
          segmentDuration >= segmentLength ||
          word === words[words.length - 1]
        ) {
          // Create segment
          const segmentText = segmentWords
            .map((w: { word: string }) => w.word)
            .join(' ');
          const avgConfidence =
            segmentWords.reduce(
              (sum: number, w: { confidence: number }) =>
                sum + (typeof w.confidence === 'number' ? w.confidence : 0),
              0,
            ) / (segmentWords.length > 0 ? segmentWords.length : 1);
          const duration = endTime - segmentStartTime;

          segments.push({
            _id: uuidv4(),
            startTime: this.secondsToTimeString(segmentStartTime + timeOffset),
            endTime: this.secondsToTimeString(endTime + timeOffset),
            startSeconds: segmentStartTime + timeOffset,
            endSeconds: endTime + timeOffset,
            duration,
            text: segmentText,
            wordCount: segmentWords.length,
            avgConfidence,
            speakerChange: false, // TODO: Implement speaker change detection
          });

          // Reset for next segment
          segmentWords = [];
        }
      }
    }

    return segments;
  }

  private secondsToTimeString(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
