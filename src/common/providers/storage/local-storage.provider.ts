import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  IStorageProvider,
  StorageConfig,
  UploadResult,
} from '../../interfaces/storage.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  async uploadFile(
    file: Express.Multer.File,
    config: StorageConfig,
  ): Promise<UploadResult> {
    const uploadPath = config.path || './uploads';
    await this.ensureUploadDirExists(uploadPath);

    const fileExtension = file.originalname.split('.').pop();
    const storedName = `${uuidv4()}.${fileExtension}`;
    const filePath = join(uploadPath, storedName);

    await fs.writeFile(filePath, file.buffer);

    return {
      filePath,
      metadata: {
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
    };
  }

  async deleteFile(filePath: string, config: StorageConfig): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist, ignore error
    }
  }

  async getFileUrl(filePath: string, config: StorageConfig): Promise<string> {
    // For local storage, return the file path
    return filePath;
  }

  private async ensureUploadDirExists(uploadPath: string): Promise<void> {
    try {
      await fs.access(uploadPath);
    } catch {
      await fs.mkdir(uploadPath, { recursive: true });
    }
  }
}
