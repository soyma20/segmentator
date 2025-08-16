import { Module } from '@nestjs/common';
import { FfmpegService } from './ffmpeg.service';

@Module({
  providers: [FfmpegService],
})
export class FfmpegModule {}
