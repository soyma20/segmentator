import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IAudioProcessor,
  AudioProcessingConfig,
} from '../../interfaces/audio-processing.interface';
import type { TranscriptionSegment } from '../../../transcription/schemas/transcription-segment.schema';

@Injectable()
export class AudioProcessingService {
  constructor(
    @Inject('AUDIO_PROCESSOR') private readonly audioProcessor: IAudioProcessor,
    private readonly configService: ConfigService,
  ) {}

  async transcribeAndSegmentAudio(
    filePath: string,
    languageCode: string,
    sampleRateHertz: number = 16000,
    segmentLength: number = 60,
  ): Promise<TranscriptionSegment[]> {
    const config: AudioProcessingConfig = {
      languageCode,
      sampleRateHertz,
      segmentLength,
    };

    return this.audioProcessor.transcribeAndSegmentAudio(filePath, config);
  }

  getCurrentProvider(): string {
    return this.configService.get<string>(
      'TRANSCRIPTION_PROVIDER',
      'google_speech',
    );
  }
}
