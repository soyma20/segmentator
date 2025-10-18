import { Injectable } from '@nestjs/common';
import { TranscriptionSegment } from '../../../transcription/schemas/transcription-segment.schema';
import {
  IAudioProcessor,
  AudioProcessingConfig,
} from '../../interfaces/audio-processing.interface';

@Injectable()
export class AzureSpeechProcessor implements IAudioProcessor {
  async transcribeAndSegmentAudio(
    filePath: string,
    config: AudioProcessingConfig,
  ): Promise<TranscriptionSegment[]> {
    // TODO: Implement Azure Speech integration
    // This is a placeholder implementation
    throw new Error('Azure Speech processor not implemented yet');
  }
}
