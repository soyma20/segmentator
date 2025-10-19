import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { File } from '../src/files/schemas/file.schema';
import { ProcessingHistory } from '../src/processing/schemas/processing-history.schema';
import { UploadFileDto } from '../src/files/dto/upload-file.dto';

@Injectable()
export class FilesTestService {
  constructor(
    @InjectModel(File.name) private fileModel: Model<File>,
    @InjectModel(ProcessingHistory.name)
    private processingHistoryModel: Model<ProcessingHistory>,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    uploadData: UploadFileDto,
  ): Promise<{ file: File; processingHistory?: ProcessingHistory }> {
    // Mock implementation for testing
    const mockFile = new this.fileModel({
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedAt: new Date(),
    });

    return { file: await mockFile.save() };
  }

  async getAllFiles(): Promise<File[]> {
    return this.fileModel.find().exec();
  }

  async getFileById(id: string): Promise<File | null> {
    return this.fileModel.findById(id).exec();
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await this.fileModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}
