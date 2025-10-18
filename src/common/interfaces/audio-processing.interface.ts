import { TranscriptionSegment } from '../../transcription/schemas/transcription-segment.schema';

export interface AudioProcessingConfig {
  languageCode: string;
  sampleRateHertz?: number;
  segmentLength?: number;
}

export interface IAudioProcessor {
  transcribeAndSegmentAudio(
    filePath: string,
    config: AudioProcessingConfig,
  ): Promise<TranscriptionSegment[]>;
}
