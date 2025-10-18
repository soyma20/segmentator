import { Injectable, Logger } from '@nestjs/common';
import { SpeechClient } from '@google-cloud/speech';
import { google } from '@google-cloud/speech/build/protos/protos';
import { Storage } from '@google-cloud/storage';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { TranscriptionSegment } from 'src/transcription/schemas/transcription-segment.schema';

@Injectable()
export class GoogleSpeechService {
  private readonly logger = new Logger(GoogleSpeechService.name);
  private readonly speechClient: SpeechClient;
  private readonly storage: Storage;
  private readonly BUCKET_NAME = 'yaro-segmentator-transcripts-2025';

  constructor() {
    this.speechClient = new SpeechClient();
    this.storage = new Storage(); // Assumes auth is set up via env vars
  }

  async transcribeAndSegmentAudio(
    filePath: string,
    languageCode = 'en-US', // Use en-US
    sampleRateHertz = 16000,
    segmentLength = 60,
  ): Promise<TranscriptionSegment[]> {
    this.logger.log(`Starting transcription for: ${filePath}`);
    const gcsFileName = `audio-uploads/${randomUUID()}-${Date.now()}.wav`;

    try {
      // 1. Upload the *entire* file to GCS
      this.logger.log(`Uploading ${filePath} to GCS as ${gcsFileName}`);
      await this.storage.bucket(this.BUCKET_NAME).upload(filePath, {
        destination: gcsFileName,
      });

      const gcsUri = `gs://${this.BUCKET_NAME}/${gcsFileName}`;

      // 2. Transcribe using the GCS URI
      const response = await this.transcribeAudioFromGcs(
        gcsUri,
        sampleRateHertz,
        languageCode,
      );

      // 3. Get audio duration from the response (more accurate)
      // Or estimate from file, but this is safer
      const file = await fs.readFile(filePath);
      const audioDuration = this.estimateDuration(file.length, sampleRateHertz);

      // 4. Create segments from the *single, complete* response
      const allSegments = this.createSegmentsFromResponse(
        response,
        audioDuration,
        segmentLength,
        0, // No time offset needed
      );

      this.logger.log(
        `Transcription completed. Generated ${allSegments.length} segments`,
      );

      // 5. Clean up the file from GCS
      this.storage
        .bucket(this.BUCKET_NAME)
        .file(gcsFileName)
        .delete()
        .catch((err) =>
          this.logger.warn(`Failed to delete GCS file: ${gcsFileName}`, err),
        );

      return allSegments;
    } catch (error) {
      this.logger.error(`Failed to transcribe audio for ${filePath}`, error);

      // Clean up on failure
      this.storage
        .bucket(this.BUCKET_NAME)
        .file(gcsFileName)
        .delete()
        .catch((err) =>
          this.logger.warn(`Failed to delete GCS file: ${gcsFileName}`, err),
        );

      let errorMessage = 'Speech-to-Text transcription failed';
      if (error.message?.includes('INVALID_ARGUMENT')) {
        errorMessage = 'Invalid audio format or configuration.';
      }
      throw new Error(errorMessage);
    }
  }
  private async transcribeAudioFromGcs(
    gcsUri: string,
    sampleRateHertz: number,
    languageCode: string,
  ): Promise<google.cloud.speech.v1.ILongRunningRecognizeResponse> {
    this.logger.log(
      `Transcribing audio from GCS: ${gcsUri}, sampleRate=${sampleRateHertz}`,
    );

    const audio = { uri: gcsUri }; // Use URI instead of content
    const config = {
      encoding: 'LINEAR16' as const,
      sampleRateHertz,
      languageCode,
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
      model: 'default',
    };

    this.logger.log(`Speech config: ${JSON.stringify(config)}`);

    // Use asynchronous recognition for long audio from GCS
    const [operation] = await this.speechClient.longRunningRecognize({
      audio,
      config,
    });
    this.logger.log(
      'Long-running operation started, waiting for completion...',
    );

    const [response] = await operation.promise();
    this.logger.log(
      `Async recognition completed. Results: ${response.results?.length || 0}`,
    );
    return response;
  }

  private createSegmentsFromResponse(
    response: google.cloud.speech.v1.IRecognizeResponse,
    audioDuration: number,
    segmentLength: number,
    timeOffset: number = 0,
  ): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];

    // Check if we actually got any transcription results
    const hasResults = response.results && response.results.length > 0;
    this.logger.log(`Response has ${response.results?.length || 0} results`);

    if (!hasResults) {
      this.logger.warn(
        'No transcription results found - audio may be silent or unrecognizable',
      );
      // Create a single segment with placeholder text for the entire duration
      const actualStartTime = timeOffset;
      const actualEndTime = timeOffset + audioDuration;

      const segment: TranscriptionSegment = {
        _id: randomUUID(),
        startTime: this.formatTime(actualStartTime),
        endTime: this.formatTime(actualEndTime),
        startSeconds: actualStartTime,
        endSeconds: actualEndTime,
        duration: audioDuration,
        text: '[No speech detected]', // Provide non-empty text to avoid validation error
        wordCount: 0,
        avgConfidence: 0,
        speakerChange: false,
      };

      return [segment];
    }

    // Extract all words with timestamps from the response
    const allWords: Array<{
      word: string;
      startTime: number;
      endTime: number;
      confidence?: number;
    }> = [];
    const allConfidences: number[] = [];

    response.results?.forEach((result) => {
      if (result.alternatives && result.alternatives.length > 0) {
        const alt = result.alternatives[0];
        if (alt.confidence) {
          allConfidences.push(alt.confidence);
        }

        alt.words?.forEach((wordInfo) => {
          if (wordInfo.word) {
            const start = this.convertTimeToSeconds(wordInfo.startTime);
            const end = this.convertTimeToSeconds(wordInfo.endTime);
            allWords.push({
              word: wordInfo.word,
              startTime: start,
              endTime: end,
              confidence: alt.confidence || undefined,
            });
          }
        });
      }
    });

    this.logger.log(`Extracted ${allWords.length} words from transcription`);

    // Create segments based on the specified segment length
    let currentTime = 0;
    while (currentTime < audioDuration) {
      const endTime = Math.min(currentTime + segmentLength, audioDuration);
      const segmentWords: string[] = [];

      // Find words that fall within this segment
      allWords.forEach((wordInfo) => {
        if (wordInfo.startTime >= currentTime && wordInfo.endTime <= endTime) {
          segmentWords.push(wordInfo.word);
        }
      });

      const text =
        segmentWords.length > 0
          ? segmentWords.join(' ')
          : '[No speech detected]';
      const wordCount = segmentWords.length;
      const avgConfidence =
        allConfidences.length > 0
          ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
          : 0;

      // Apply time offset for chunks
      const actualStartTime = currentTime + timeOffset;
      const actualEndTime = endTime + timeOffset;

      const segment: TranscriptionSegment = {
        _id: randomUUID(),
        startTime: this.formatTime(actualStartTime),
        endTime: this.formatTime(actualEndTime),
        startSeconds: actualStartTime,
        endSeconds: actualEndTime,
        duration: endTime - currentTime,
        text,
        wordCount,
        avgConfidence,
        speakerChange: false,
      };

      segments.push(segment);
      currentTime = endTime;
    }

    return segments;
  }

  // Helper method to get full transcription text for error handling
  getFullTranscriptionText(segments: TranscriptionSegment[]): string {
    return segments
      .map((segment) => segment.text)
      .filter((text) => text.trim())
      .join(' ');
  }

  private estimateDuration(fileSizeBytes: number, sampleRate: number): number {
    const bytesPerSample = 2; // LINEAR16 → 16 біт
    const numSamples = fileSizeBytes / bytesPerSample;
    return numSamples / sampleRate;
  }

  private convertTimeToSeconds(
    time: google.protobuf.IDuration | null | undefined,
  ): number {
    if (!time) return 0;
    const seconds = Number(time.seconds || 0);
    const nanos = Number(time.nanos || 0);
    return seconds + nanos / 1e9;
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [hours, minutes, seconds]
      .map((v) => String(v).padStart(2, '0'))
      .join(':');
  }
}
