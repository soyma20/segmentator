import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageType } from '../../enums/storage-type.enum';
import type {
  IStorageProvider,
  StorageConfig,
  UploadResult,
} from '../../interfaces/storage.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject('STORAGE_PROVIDER')
    private readonly storageProvider: IStorageProvider,
    private readonly configService: ConfigService,
  ) {}

  async uploadFile(file: Express.Multer.File): Promise<UploadResult> {
    const storageType = this.configService.get<string>(
      'STORAGE_TYPE',
      'local',
    ) as StorageType;

    const config: StorageConfig = {
      type: storageType,
      path: this.configService.get<string>('UPLOAD_PATH', './uploads'),
      bucket: this.configService.get<string>('STORAGE_BUCKET'),
      region: this.configService.get<string>('STORAGE_REGION'),
    };

    return this.storageProvider.uploadFile(file, config);
  }

  async deleteFile(filePath: string): Promise<void> {
    const storageType = this.configService.get<string>(
      'STORAGE_TYPE',
      'local',
    ) as StorageType;

    const config: StorageConfig = {
      type: storageType,
      path: this.configService.get<string>('UPLOAD_PATH', './uploads'),
      bucket: this.configService.get<string>('STORAGE_BUCKET'),
      region: this.configService.get<string>('STORAGE_REGION'),
    };

    return this.storageProvider.deleteFile(filePath, config);
  }

  async getFileUrl(filePath: string): Promise<string> {
    const storageType = this.configService.get<string>(
      'STORAGE_TYPE',
      'local',
    ) as StorageType;

    const config: StorageConfig = {
      type: storageType,
      path: this.configService.get<string>('UPLOAD_PATH', './uploads'),
      bucket: this.configService.get<string>('STORAGE_BUCKET'),
      region: this.configService.get<string>('STORAGE_REGION'),
    };

    return this.storageProvider.getFileUrl(filePath, config);
  }
}
