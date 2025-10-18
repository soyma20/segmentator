import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageType } from '../../enums/storage-type.enum';
import { LocalStorageProvider } from './local-storage.provider';
import { CloudStorageProvider } from './cloud-storage.provider';
import { StorageService } from './storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageProvider,
    CloudStorageProvider,
    {
      provide: 'STORAGE_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const storageType = configService.get<string>('STORAGE_TYPE', 'local');

        switch (storageType) {
          case StorageType.CLOUD:
            return new CloudStorageProvider();
          case StorageType.LOCAL:
          default:
            return new LocalStorageProvider();
        }
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
