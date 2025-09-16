import { Injectable, Logger } from '@nestjs/common';
import { SpeechClient } from '@google-cloud/speech';
import { google } from '@google-cloud/speech/build/protos/protos';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { TranscriptionSegment } from 'src/transcription/schemas/transcription-segment.schema';

@Injectable()
export class GoogleSpeechService {
  private readonly logger = new Logger(GoogleSpeechService.name);
  private readonly speechClient: SpeechClient;

  constructor() {
    this.speechClient = new SpeechClient();
  }

  async transcribeAndSegmentAudio(
    filePath: string,
    languageCode = 'uk-UA',
    sampleRateHertz = 16000,
    segmentLength = 60, // сек
  ): Promise<TranscriptionSegment[]> {
    this.logger.log(`Starting transcription for: ${filePath}`);

    try {
      const file = await fs.readFile(filePath);
      const audioBytes = file.toString('base64');

      const audio = { content: audioBytes };
      const config = {
        encoding: 'LINEAR16' as const,
        sampleRateHertz,
        languageCode,
        enableWordTimeOffsets: true,
      };

      const durationInSeconds = this.estimateDuration(
        file.length,
        sampleRateHertz,
      );

      let response: google.cloud.speech.v1.IRecognizeResponse;

      if (durationInSeconds <= 60) {
        const [res] = (await this.speechClient.recognize({
          audio,
          config,
        })) as unknown as [google.cloud.speech.v1.IRecognizeResponse];
        response = res;
      } else {
        const [operation] = await this.speechClient.longRunningRecognize({
          audio,
          config,
        });
        const [res] = (await operation.promise()) as unknown as [
          google.cloud.speech.v1.IRecognizeResponse,
          unknown,
          unknown,
        ];
        response = res;
      }

      return this.createSegmentsFromResponse(
        response,
        durationInSeconds,
        segmentLength,
      );
    } catch (error) {
      this.logger.error(`Failed to transcribe audio for ${filePath}`, error);
      throw new Error('Speech-to-Text transcription failed');
    }
  }

  private createSegmentsFromResponse(
    response: google.cloud.speech.v1.IRecognizeResponse,
    audioDuration: number,
    segmentLength: number,
  ): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    let currentTime = 0;

    while (currentTime < audioDuration) {
      const endTime = Math.min(currentTime + segmentLength, audioDuration);
      const words: string[] = [];
      const confidences: number[] = [];

      if (response.results) {
        response.results.forEach((result) => {
          if (result.alternatives && result.alternatives.length > 0) {
            const alt = result.alternatives[0];
            if (alt.confidence) {
              confidences.push(alt.confidence);
            }

            alt.words?.forEach((wordInfo) => {
              const start = this.convertTimeToSeconds(wordInfo.startTime);
              const end = this.convertTimeToSeconds(wordInfo.endTime);

              if (start >= currentTime && end <= endTime && wordInfo.word) {
                words.push(wordInfo.word);
              }
            });
          }
        });
      }

      const text = words.join(' ');
      const wordCount = words.length;
      const avgConfidence =
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : 0;

      const segment: TranscriptionSegment = {
        _id: randomUUID(),
        startTime: this.formatTime(currentTime),
        endTime: this.formatTime(endTime),
        startSeconds: currentTime,
        endSeconds: endTime,
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
