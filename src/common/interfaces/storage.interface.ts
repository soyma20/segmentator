export interface StorageConfig {
  type: 'local' | 'cloud';
  path?: string;
  bucket?: string;
  region?: string;
}

export interface UploadResult {
  filePath: string;
  url?: string;
  metadata?: Record<string, any>;
}

export interface IStorageProvider {
  uploadFile(
    file: Express.Multer.File,
    config: StorageConfig,
  ): Promise<UploadResult>;

  deleteFile(filePath: string, config: StorageConfig): Promise<void>;

  getFileUrl(filePath: string, config: StorageConfig): Promise<string>;
}
