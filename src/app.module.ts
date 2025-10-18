import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FilesModule } from './files/files.module';
import { ProcessingModule } from './processing/processing.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ClippingModule } from './processing/clipping.module';
import { QueuesModule } from 'src/queues/queues.module';
import { DatabaseModule } from './database/database.module';
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
    ClippingModule,
    QueuesModule,
    FfmpegModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
