import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleSpeechProcessor } from './google-speech.processor';
import { OpenaiWhisperProcessor } from './openai-whisper.processor';
import { AzureSpeechProcessor } from './azure-speech.processor';
import { AudioProcessingService } from './audio-processing.service';

@Module({
  imports: [ConfigModule],
  providers: [
    GoogleSpeechProcessor,
    OpenaiWhisperProcessor,
    AzureSpeechProcessor,
    {
      provide: 'AUDIO_PROCESSOR',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>(
          'TRANSCRIPTION_PROVIDER',
          'google_speech',
        );

        switch (provider) {
          case 'openai_whisper':
            return new OpenaiWhisperProcessor();
          case 'azure_speech':
            return new AzureSpeechProcessor();
          case 'google_speech':
          default:
            return new GoogleSpeechProcessor();
        }
      },
      inject: [ConfigService],
    },
    AudioProcessingService,
  ],
  exports: [AudioProcessingService],
})
export class AudioProcessingModule {}
