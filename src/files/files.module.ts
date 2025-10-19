import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { File, FileSchema } from './schemas/file.schema';
import {
  ProcessingHistory,
  ProcessingHistorySchema,
} from '../processing/schemas/processing-history.schema';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { QueuesModule } from '../queues/queues.module';
import { StorageModule } from '../common/providers/storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
    ]),
    QueuesModule,
    StorageModule,
    BullModule.registerQueue({
      name: 'transcription',
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
