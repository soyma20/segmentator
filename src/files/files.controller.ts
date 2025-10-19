import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Body,
  ParseFilePipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FilesService } from './files.service';
import { MIMES } from '../common/constants/mimes.constant';
import { UploadFileDto } from './dto/upload-file.dto';

@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) {}

  private static getMaxFileSize(): number {
    const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE || '100', 10);
    return maxFileSizeMB * 1024 * 1024;
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: FilesController.getMaxFileSize(),
      },
      fileFilter: (req, file, callback) => {
        if (MIMES.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('Invalid file type'), false);
        }
      },
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body('uploadData') uploadDataString: string,
  ) {
    if (!uploadDataString) {
      throw new BadRequestException('uploadData form field is required.');
    }

    let uploadData: UploadFileDto;

    try {
      const parsedData: unknown = JSON.parse(uploadDataString);

      uploadData = plainToInstance(UploadFileDto, parsedData);
    } catch {
      throw new BadRequestException(
        'Invalid format for uploadData. Must be a valid JSON string.',
      );
    }

    const errors = await validate(uploadData, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return this.filesService.uploadFile(file, uploadData);
  }

  @Get()
  async getAllFiles() {
    return this.filesService.getAllFiles();
  }

  @Get(':id')
  async getFile(@Param('id') id: string) {
    return this.filesService.getFileById(id);
  }

  @Delete(':id')
  async deleteFile(@Param('id') id: string) {
    await this.filesService.deleteFile(id);
    return { message: 'File deleted successfully' };
  }
}
