import { Module } from '@nestjs/common';
import { GoogleSpeechService } from './google-speech.service';

@Module({
  providers: [GoogleSpeechService]
})
export class GoogleSpeechModule {}
