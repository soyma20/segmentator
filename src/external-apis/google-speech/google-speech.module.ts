import { Module } from '@nestjs/common';
import { GoogleSpeechService } from './google-speech.service';

@Module({
  providers: [GoogleSpeechService],
  exports: [GoogleSpeechService],
})
export class GoogleSpeechModule {}
