import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { File, FileSchema } from './schemas/file.schema';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { QueuesModule } from 'src/queues/queues.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: File.name, schema: FileSchema }]),
    QueuesModule,
    BullModule.registerQueue({
      name: 'transcription',
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
