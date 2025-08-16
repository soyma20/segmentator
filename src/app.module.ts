import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FilesModule } from './files/files.module';
import { ProcessingModule } from './processing/processing.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { AnalysisModule } from './analysis/analysis.module';
import { QueuesModule } from './queues/queues.module';
import { DatabaseModule } from './database/database.module';
import { OpenaiModule } from './external-apis/openai/openai.module';
import { GoogleSpeechModule } from './external-apis/google-speech/google-speech.module';
import { FfmpegModule } from './services/ffmpeg/ffmpeg.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    FilesModule,
    ProcessingModule,
    TranscriptionModule,
    AnalysisModule,
    QueuesModule,
    OpenaiModule,
    GoogleSpeechModule,
    FfmpegModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
