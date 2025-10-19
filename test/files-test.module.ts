import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { File, FileSchema } from '../src/files/schemas/file.schema';
import {
  ProcessingHistory,
  ProcessingHistorySchema,
} from '../src/processing/schemas/processing-history.schema';
import { FilesTestService } from './files-test.service';
import { FilesController } from '../src/files/files.controller';
import { FilesService } from '../src/files/files.service';
import { StorageModule } from '../src/common/providers/storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
      { name: ProcessingHistory.name, schema: ProcessingHistorySchema },
    ]),
    StorageModule,
    // Exclude QueuesModule and BullModule for e2e testing
  ],
  controllers: [FilesController],
  providers: [
    {
      provide: FilesService,
      useClass: FilesTestService,
    },
  ],
  exports: [FilesService],
})
export class FilesTestModule {}
