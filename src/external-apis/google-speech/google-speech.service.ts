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
  private readonly MAX_CHUNK_DURATION = 60; // 1 minute in seconds (what actually works with Google)

  constructor() {
    this.speechClient = new SpeechClient();
  }

  async transcribeAndSegmentAudio(
    filePath: string,
    languageCode = 'en',
    sampleRateHertz = 16000,
    segmentLength = 60, // сек
  ): Promise<TranscriptionSegment[]> {
    this.logger.log(`Starting transcription for: ${filePath}`);

    try {
      const file = await fs.readFile(filePath);
      const durationInSeconds = this.estimateDuration(
        file.length,
        sampleRateHertz,
      );

      this.logger.log(`Estimated duration: ${durationInSeconds} seconds`);
      this.logger.log(`Max chunk duration: ${this.MAX_CHUNK_DURATION} seconds`);

      let allSegments: TranscriptionSegment[] = [];

      if (durationInSeconds <= this.MAX_CHUNK_DURATION) {
        // Process as single file
        this.logger.log('Processing as single file');
        try {
          const response = await this.transcribeAudioBuffer(
            file,
            sampleRateHertz,
            languageCode,
            durationInSeconds,
          );
          allSegments = this.createSegmentsFromResponse(
            response,
            durationInSeconds,
            segmentLength,
            0,
          );
        } catch (error) {
          if (error.message?.includes('duration limit')) {
            this.logger.warn(
              'Single file processing failed due to duration limit, falling back to chunking...',
            );
            // Fallback to chunking even if duration estimate was wrong
            const chunks = this.splitAudioIntoChunks(
              file,
              sampleRateHertz,
              Math.min(this.MAX_CHUNK_DURATION / 2, 30),
            ); // 30 seconds as fallback
            this.logger.log(
              `Fallback: Split audio into ${chunks.length} chunks`,
            );

            let timeOffset = 0;
            for (let i = 0; i < chunks.length; i++) {
              this.logger.log(
                `Processing fallback chunk ${i + 1}/${chunks.length}`,
              );

              const chunkDuration = this.estimateDuration(
                chunks[i].length,
                sampleRateHertz,
              );
              const response = await this.transcribeAudioBuffer(
                chunks[i],
                sampleRateHertz,
                languageCode,
                chunkDuration,
              );

              const chunkSegments = this.createSegmentsFromResponse(
                response,
                chunkDuration,
                segmentLength,
                timeOffset,
              );

              allSegments.push(...chunkSegments);
              timeOffset += chunkDuration;
            }
          } else {
            throw error;
          }
        }
      } else {
        // Split audio into chunks and process each
        this.logger.log('Processing with chunking');
        const chunks = this.splitAudioIntoChunks(
          file,
          sampleRateHertz,
          this.MAX_CHUNK_DURATION,
        );
        this.logger.log(`Split audio into ${chunks.length} chunks`);

        let timeOffset = 0;
        for (let i = 0; i < chunks.length; i++) {
          this.logger.log(`Processing chunk ${i + 1}/${chunks.length}`);

          const chunkDuration = this.estimateDuration(
            chunks[i].length,
            sampleRateHertz,
          );
          const response = await this.transcribeAudioBuffer(
            chunks[i],
            sampleRateHertz,
            languageCode,
            chunkDuration,
          );

          const chunkSegments = this.createSegmentsFromResponse(
            response,
            chunkDuration,
            segmentLength,
            timeOffset,
          );

          allSegments.push(...chunkSegments);
          timeOffset += chunkDuration;
        }
      }

      this.logger.log(
        `Transcription completed. Generated ${allSegments.length} segments`,
      );
      return allSegments;
    } catch (error) {
      this.logger.error(`Failed to transcribe audio for ${filePath}`, error);

      let errorMessage = 'Speech-to-Text transcription failed';
      if (error.message?.includes('INVALID_ARGUMENT')) {
        errorMessage = 'Invalid audio format or configuration.';
      }

      throw new Error(errorMessage);
    }
  }

  private async transcribeAudioBuffer(
    audioBuffer: Buffer,
    sampleRateHertz: number,
    languageCode: string,
    durationInSeconds: number,
  ): Promise<google.cloud.speech.v1.IRecognizeResponse> {
    this.logger.log(
      `Transcribing audio buffer: size=${audioBuffer.length} bytes, duration=${durationInSeconds}s, sampleRate=${sampleRateHertz}`,
    );

    // Basic validation
    if (audioBuffer.length < 100) {
      this.logger.warn(
        `Audio buffer is very small: ${audioBuffer.length} bytes`,
      );
    }

    // Check for silence by examining audio samples
    const samples: number[] = [];
    for (let i = 0; i < Math.min(audioBuffer.length, 1000); i += 2) {
      const sample = audioBuffer.readInt16LE(i);
      samples.push(Math.abs(sample));
    }
    const avgAmplitude = samples.reduce((a, b) => a + b, 0) / samples.length;
    this.logger.log(
      `Average audio amplitude in first samples: ${avgAmplitude}`,
    );

    const audioBytes = audioBuffer.toString('base64');
    const audio = { content: audioBytes };
    const config = {
      encoding: 'LINEAR16' as const,
      sampleRateHertz,
      languageCode,
      enableWordTimeOffsets: true,
      // Add more configuration options to help with recognition
      enableAutomaticPunctuation: true,
      model: 'default', // Try default model first
    };

    this.logger.log(`Speech config: ${JSON.stringify(config)}`);

    if (durationInSeconds <= 60) {
      // Use synchronous recognition for short audio
      const [response] = await this.speechClient.recognize({
        audio,
        config,
      });
      this.logger.log(
        `Sync recognition completed. Results: ${response.results?.length || 0}`,
      );
      return response;
    } else {
      // Use asynchronous recognition for longer audio (but still under 10 minutes)
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
  }

  private splitAudioIntoChunks(
    audioBuffer: Buffer,
    sampleRate: number,
    maxDurationSeconds: number,
  ): Buffer[] {
    const chunks: Buffer[] = [];
    const bytesPerSample = 2; // LINEAR16 = 16 bits = 2 bytes
    const maxBytesPerChunk = maxDurationSeconds * sampleRate * bytesPerSample;

    let offset = 0;
    while (offset < audioBuffer.length) {
      const chunkSize = Math.min(maxBytesPerChunk, audioBuffer.length - offset);

      // Ensure we split on sample boundaries (every 2 bytes for 16-bit audio)
      const alignedChunkSize =
        Math.floor(chunkSize / bytesPerSample) * bytesPerSample;

      const chunk = audioBuffer.subarray(offset, offset + alignedChunkSize);
      chunks.push(chunk);
      offset += alignedChunkSize;
    }

    return chunks;
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
      console.log('result', result);
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
