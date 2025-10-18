import { Injectable } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import {
  IStorageProvider,
  StorageConfig,
  UploadResult,
} from '../../interfaces/storage.interface';

@Injectable()
export class CloudStorageProvider implements IStorageProvider {
  private readonly storage: Storage;

  constructor() {
    this.storage = new Storage();
  }

  async uploadFile(
    file: Express.Multer.File,
    config: StorageConfig,
  ): Promise<UploadResult> {
    if (!config.bucket) {
      throw new Error('Bucket name is required for cloud storage');
    }

    const bucket = this.storage.bucket(config.bucket);
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const fileUpload = bucket.file(fileName);

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
        },
      },
    });

    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', async () => {
        try {
          const [url] = await fileUpload.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
          });

          resolve({
            filePath: fileName,
            url,
            metadata: {
              originalName: file.originalname,
              bucket: config.bucket,
              mimeType: file.mimetype,
              fileSize: file.size,
            },
          });
        } catch (error) {
          reject(error);
        }
      });

      stream.end(file.buffer);
    });
  }

  async deleteFile(filePath: string, config: StorageConfig): Promise<void> {
    if (!config.bucket) {
      throw new Error('Bucket name is required for cloud storage');
    }

    const bucket = this.storage.bucket(config.bucket);
    const file = bucket.file(filePath);

    try {
      await file.delete();
    } catch (error) {
      // File might not exist, ignore error
    }
  }

  async getFileUrl(filePath: string, config: StorageConfig): Promise<string> {
    if (!config.bucket) {
      throw new Error('Bucket name is required for cloud storage');
    }

    const bucket = this.storage.bucket(config.bucket);
    const file = bucket.file(filePath);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return url;
  }
}
