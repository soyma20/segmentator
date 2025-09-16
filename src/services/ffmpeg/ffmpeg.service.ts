import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { ensureDir } from 'fs-extra';

export interface Timecode {
  start: string;
  end: string;
}

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  async convertVideoToAudio(
    inputPath: string,
    outputPath: string,
  ): Promise<string> {
    this.logger.log(
      `Starting conversion from ${inputPath} to ${outputPath}...`,
    );

    const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    await ensureDir(outputDir);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .save(outputPath)
        .on('end', () => {
          this.logger.log(`Conversion finished successfully: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          this.logger.error(
            `An error occurred during conversion: ${err.message}`,
          );
          reject(new Error(err.message));
        });
    });
  }

  async cutMediaByTimecodes(
    inputPath: string,
    timecodes: Timecode[],
    outputPattern: string,
  ): Promise<string[]> {
    this.logger.log(`Starting to cut file ${inputPath}...`);

    const outputPaths: string[] = [];
    const cutPromises: Promise<void>[] = [];

    const outputDir = outputPattern.substring(
      0,
      outputPattern.lastIndexOf('/'),
    );
    await ensureDir(outputDir);

    timecodes.forEach((timecode, index) => {
      const outputPath = outputPattern.replace('%i', String(index + 1));
      outputPaths.push(outputPath);

      const promise = new Promise<void>((resolve, reject) => {
        const duration = this.calculateDuration(timecode.start, timecode.end);
        if (duration <= 0) {
          this.logger.warn(
            `Invalid timecode for segment ${
              index + 1
            }: start=${timecode.start}, end=${timecode.end}. Skipping segment.`,
          );
          resolve();
          return;
        }

        ffmpeg(inputPath)
          .setStartTime(timecode.start)
          .setDuration(duration)
          .output(outputPath)
          .on('end', () => {
            this.logger.log(`Segment ${outputPath} created successfully.`);
            resolve();
          })
          .on('error', (err: Error) => {
            this.logger.error(
              `Error creating segment ${outputPath}: ${err.message}`,
            );
            reject(new Error(err.message));
          })
          .run();
      });

      cutPromises.push(promise);
    });

    await Promise.all(cutPromises);
    this.logger.log('Finished cutting all segments.');
    return outputPaths;
  }

  private calculateDuration(start: string, end: string): number {
    const startTimeInSeconds = this.timeToSeconds(start);
    const endTimeInSeconds = this.timeToSeconds(end);
    return endTimeInSeconds - startTimeInSeconds;
  }

  private timeToSeconds(time: string): number {
    if (!isNaN(Number(time))) {
      return Number(time);
    }
    const parts = time.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      throw new Error(`Invalid time format: ${time}`);
    }
    return seconds;
  }
}
