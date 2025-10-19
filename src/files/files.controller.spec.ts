import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { LlmProvider } from '../common/enums/llm-provider.enum';
import { VideoType } from '../common/enums/video-type.enum';
import { StorageType } from '../common/enums/storage-type.enum';
import { ProcessingStatus } from '../common/enums/processing-status.enum';
import { File } from './schemas/file.schema';
import { ProcessingHistory } from '../processing/schemas/processing-history.schema';

describe('FilesController', () => {
  let controller: FilesController;
  let filesService: jest.Mocked<FilesService>;

  const mockFile = {
    fieldname: 'file',
    originalname: 'test-video.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    size: 1024000,
    buffer: Buffer.from('test file content'),
    stream: null,
    destination: '',
    filename: '',
    path: '',
  } as unknown as Express.Multer.File;

  const mockUploadData: UploadFileDto = {
    languageCode: 'en-US',
    processingConfiguration: {
      segmentDuration: 30,
      llmProvider: LlmProvider.OPENAI,
      llmModel: 'gpt-4o-mini',
      analysisConfig: {
        videoType: VideoType.GENERAL,
        focusAreas: ['technical'],
        targetAudience: 'developers',
        minInformativenessScore: 0.5,
        maxCombinedDuration: 300,
      },
      clippingConfig: {
        maxClips: 10,
        minScoreThreshold: 5,
      },
    },
  };

  beforeEach(async () => {
    const mockFilesService = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      getAllFiles: jest.fn().mockResolvedValue([]),
      getFileById: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
      ],
    }).compile();

    controller = module.get<FilesController>(FilesController);
    filesService = module.get(FilesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload file successfully with valid data', async () => {
      const mockFileResult: Partial<File> = {
        _id: 'file-id',
        originalName: 'test-video.mp4',
        storedName: 'test-video.mp4',
        filePath: '/uploads/test-video.mp4',
        storageType: StorageType.LOCAL,
        mimeType: 'video/mp4',
        fileSize: 1024000,
        duration: 120,
        format: 'mp4',
        uploadedAt: new Date(),
        totalProcessingRuns: 0,
      };

      const mockProcessingHistory: Partial<ProcessingHistory> = {
        _id: 'processing-id' as any,
        fileId: 'file-id' as any,
        processingStartedAt: new Date(),
        processingStatus: ProcessingStatus.PENDING,
        configuration: mockUploadData.processingConfiguration as any,
        processing_metrics: {},
      };

      const mockResult = {
        file: mockFileResult as File,
        processingHistory: mockProcessingHistory as ProcessingHistory,
      };

      filesService.uploadFile.mockResolvedValue(mockResult);

      const result = await controller.uploadFile(
        mockFile,
        JSON.stringify(mockUploadData),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(filesService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        expect.objectContaining({
          languageCode: 'en-US',
          processingConfiguration: expect.any(Object),
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw BadRequestException when uploadData is missing', async () => {
      await expect(
        controller.uploadFile(mockFile, undefined as unknown as string),
      ).rejects.toThrow(BadRequestException);
      await expect(controller.uploadFile(mockFile, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when uploadData is invalid JSON', async () => {
      await expect(
        controller.uploadFile(mockFile, 'invalid json'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when uploadData validation fails', async () => {
      const invalidData = { languageCode: '' }; // Missing required fields

      await expect(
        controller.uploadFile(mockFile, JSON.stringify(invalidData)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle file upload without processing configuration', async () => {
      const uploadDataWithoutConfig = {
        languageCode: 'en-US',
      };

      const mockFileResult: Partial<File> = {
        _id: 'file-id',
        originalName: 'test-video.mp4',
        storedName: 'test-video.mp4',
        filePath: '/uploads/test-video.mp4',
        storageType: StorageType.LOCAL,
        mimeType: 'video/mp4',
        fileSize: 1024000,
        duration: 120,
        format: 'mp4',
        uploadedAt: new Date(),
        totalProcessingRuns: 0,
      };

      const mockResult = {
        file: mockFileResult as File,
        processingHistory: undefined,
      };

      filesService.uploadFile.mockResolvedValue(mockResult);

      const result = await controller.uploadFile(
        mockFile,
        JSON.stringify(uploadDataWithoutConfig),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(filesService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        expect.objectContaining({
          languageCode: 'en-US',
          processingConfiguration: undefined,
        }),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getAllFiles', () => {
    it('should return all files', async () => {
      const mockFiles: Partial<File>[] = [
        {
          _id: 'file1',
          originalName: 'video1.mp4',
          storedName: 'video1.mp4',
          filePath: '/uploads/video1.mp4',
          storageType: StorageType.LOCAL,
          mimeType: 'video/mp4',
          fileSize: 1024000,
          duration: 120,
          format: 'mp4',
          uploadedAt: new Date(),
          totalProcessingRuns: 0,
        },
        {
          _id: 'file2',
          originalName: 'video2.mp4',
          storedName: 'video2.mp4',
          filePath: '/uploads/video2.mp4',
          storageType: StorageType.LOCAL,
          mimeType: 'video/mp4',
          fileSize: 2048000,
          duration: 240,
          format: 'mp4',
          uploadedAt: new Date(),
          totalProcessingRuns: 1,
        },
      ];

      filesService.getAllFiles.mockResolvedValue(mockFiles as File[]);

      const result = await controller.getAllFiles();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(filesService.getAllFiles).toHaveBeenCalled();
      expect(result).toEqual(mockFiles);
    });
  });

  describe('getFile', () => {
    it('should return file by id', async () => {
      const mockFileResult: Partial<File> = {
        _id: 'file-id',
        originalName: 'test-video.mp4',
        storedName: 'test-video.mp4',
        filePath: '/uploads/test-video.mp4',
        storageType: StorageType.LOCAL,
        mimeType: 'video/mp4',
        fileSize: 1024000,
        duration: 120,
        format: 'mp4',
        uploadedAt: new Date(),
        totalProcessingRuns: 0,
      };
      const fileId = 'file-id';

      filesService.getFileById.mockResolvedValue(mockFileResult as File);

      const result = await controller.getFile(fileId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(filesService.getFileById).toHaveBeenCalledWith(fileId);
      expect(result).toEqual(mockFileResult);
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const fileId = 'file-id';

      filesService.deleteFile.mockResolvedValue();

      const result = await controller.deleteFile(fileId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(filesService.deleteFile).toHaveBeenCalledWith(fileId);
      expect(result).toEqual({ message: 'File deleted successfully' });
    });
  });
});
