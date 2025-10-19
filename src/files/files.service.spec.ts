import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { FilesService } from './files.service';
import { File } from './schemas/file.schema';
import { ProcessingHistory } from '../processing/schemas/processing-history.schema';
import { StorageService } from '../common/providers/storage/storage.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileOperationException } from '../common/exceptions/file-operation.exception';
import { LlmProvider } from '../common/enums/llm-provider.enum';
import { VideoType } from '../common/enums/video-type.enum';

describe('FilesService', () => {
  let service: FilesService;
  let mockFileModel: jest.Mocked<Model<File>>;
  let mockProcessingHistoryModel: jest.Mocked<Model<ProcessingHistory>>;
  let mockTranscriptionQueue: jest.Mocked<Queue>;
  let mockStorageService: jest.Mocked<StorageService>;

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
    const mockModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      exec: jest.fn(),
      find: jest.fn(),
      findByIdAndDelete: jest.fn(),
      sort: jest.fn(),
    };

    const mockQueue = {
      add: jest.fn(),
    };

    const mockStorageServiceInstance = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: getModelToken(File.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(ProcessingHistory.name),
          useValue: mockModel,
        },
        {
          provide: 'BullQueue_transcription',
          useValue: mockQueue,
        },
        {
          provide: StorageService,
          useValue: mockStorageServiceInstance,
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    mockFileModel = module.get(getModelToken(File.name));
    mockProcessingHistoryModel = module.get(
      getModelToken(ProcessingHistory.name),
    );
    mockTranscriptionQueue = module.get('BullQueue_transcription');
    mockStorageService = module.get(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockUploadResult = {
        filePath: '/uploads/test-video.mp4',
        storageType: 'local',
      };

      const mockSavedFile = {
        _id: 'file-id',
        originalName: 'test-video.mp4',
        storedName: 'test-video.mp4',
        filePath: '/uploads/test-video.mp4',
        mimeType: 'video/mp4',
        fileSize: 1024000,
        duration: 120,
        format: 'mp4',
        uploadedAt: new Date(),
        totalProcessingRuns: 0,
        save: jest.fn().mockResolvedValue({ _id: 'file-id' }),
      };

      const mockProcessingHistory = {
        _id: 'processing-id',
        fileId: 'file-id',
        processingStartedAt: new Date(),
        processingStatus: 'pending',
        configuration: mockUploadData.processingConfiguration,
        processing_metrics: {},
        save: jest.fn().mockResolvedValue({ _id: 'processing-id' }),
      };

      mockStorageService.uploadFile.mockResolvedValue(mockUploadResult);
      mockFileModel.create.mockReturnValue(mockSavedFile as any);
      mockProcessingHistoryModel.create.mockReturnValue(
        mockProcessingHistory as any,
      );
      mockTranscriptionQueue.add.mockResolvedValue({} as any);

      const result = await service.uploadFile(mockFile, mockUploadData);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(mockFile);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockFileModel.create).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockProcessingHistoryModel.create).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'process-transcription',
        expect.objectContaining({
          fileId: 'file-id',
          filePath: '/uploads/test-video.mp4',
          languageCode: 'en-US',
        }),
        expect.any(Object),
      );
      expect(result).toEqual({
        file: mockSavedFile,
        processingHistory: mockProcessingHistory,
      });
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(
        service.uploadFile(null as any, mockUploadData),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when language code is missing', async () => {
      const invalidUploadData = { ...mockUploadData, languageCode: '' };

      await expect(
        service.uploadFile(mockFile, invalidUploadData),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle upload without processing configuration', async () => {
      const uploadDataWithoutConfig = {
        languageCode: 'en-US',
      };

      const mockUploadResult = {
        filePath: '/uploads/test-video.mp4',
        storageType: 'local',
      };

      const mockSavedFile = {
        _id: 'file-id',
        originalName: 'test-video.mp4',
        save: jest.fn().mockResolvedValue({ _id: 'file-id' }),
      };

      mockStorageService.uploadFile.mockResolvedValue(mockUploadResult);
      mockFileModel.create.mockReturnValue(mockSavedFile as any);
      mockTranscriptionQueue.add.mockResolvedValue({} as any);

      const result = await service.uploadFile(
        mockFile,
        uploadDataWithoutConfig,
      );

      expect(result.processingHistory).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'process-transcription',
        expect.objectContaining({
          processingId: undefined,
        }),
        expect.any(Object),
      );
    });

    it('should handle storage service errors', async () => {
      mockStorageService.uploadFile.mockRejectedValue(
        new Error('Storage error'),
      );

      await expect(
        service.uploadFile(mockFile, mockUploadData),
      ).rejects.toThrow(FileOperationException);
    });
  });

  describe('getFileById', () => {
    it('should return file by id', async () => {
      const mockFile = { _id: 'file-id', originalName: 'test-video.mp4' };
      const fileId = 'file-id';

      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockFile),
      } as any);

      const result = await service.getFileById(fileId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId);
      expect(result).toEqual(mockFile);
    });

    it('should throw BadRequestException when file not found', async () => {
      const fileId = 'non-existent-id';

      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(service.getFileById(fileId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw InternalServerErrorException on database error', async () => {
      const fileId = 'file-id';

      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('Database error')),
      } as any);

      await expect(service.getFileById(fileId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const fileId = 'file-id';
      const mockFile = {
        _id: fileId,
        filePath: '/uploads/test-video.mp4',
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockFileModel.findByIdAndDelete.mockResolvedValue(mockFile as any);

      await service.deleteFile(fileId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockFileModel.findByIdAndDelete).toHaveBeenCalledWith(fileId);
    });

    it('should throw BadRequestException when file not found', async () => {
      const fileId = 'non-existent-id';

      mockFileModel.findById.mockResolvedValue(null);

      await expect(service.deleteFile(fileId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle file deletion errors', async () => {
      const fileId = 'file-id';
      const mockFile = {
        _id: fileId,
        filePath: '/uploads/test-video.mp4',
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockFileModel.findByIdAndDelete.mockRejectedValue(
        new Error('Delete error'),
      );

      await expect(service.deleteFile(fileId)).rejects.toThrow(
        FileOperationException,
      );
    });
  });

  describe('getAllFiles', () => {
    it('should return all files sorted by upload date', async () => {
      const mockFiles = [
        { _id: 'file1', originalName: 'video1.mp4' },
        { _id: 'file2', originalName: 'video2.mp4' },
      ];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockFiles),
      };

      mockFileModel.find.mockReturnValue(mockQuery as any);

      const result = await service.getAllFiles();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockFileModel.find).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockQuery.sort).toHaveBeenCalledWith({ uploadedAt: -1 });
      expect(result).toEqual(mockFiles);
    });

    it('should throw InternalServerErrorException on database error', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      mockFileModel.find.mockReturnValue(mockQuery as any);

      await expect(service.getAllFiles()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('private methods', () => {
    describe('getJobPriority', () => {
      it('should return priority 1 for files less than 1 minute', () => {
        const priority = (service as any).getJobPriority(30); // 30 seconds
        expect(priority).toBe(1);
      });

      it('should return priority 5 for files less than 5 minutes', () => {
        const priority = (service as any).getJobPriority(180); // 3 minutes
        expect(priority).toBe(5);
      });

      it('should return priority 10 for files less than 30 minutes', () => {
        const priority = (service as any).getJobPriority(1200); // 20 minutes
        expect(priority).toBe(10);
      });

      it('should return priority 15 for files 30+ minutes', () => {
        const priority = (service as any).getJobPriority(2400); // 40 minutes
        expect(priority).toBe(15);
      });
    });

    describe('isTranscribableFile', () => {
      it('should return true for video files', () => {
        const result = (service as any).isTranscribableFile('video/mp4');
        expect(result).toBe(true);
      });

      it('should return true for audio files', () => {
        const result = (service as any).isTranscribableFile('audio/mp3');
        expect(result).toBe(true);
      });

      it('should return false for unsupported files', () => {
        const result = (service as any).isTranscribableFile('image/jpeg');
        expect(result).toBe(false);
      });
    });

    describe('isVideoFile', () => {
      it('should return true for video mime types', () => {
        const result = (service as any).isVideoFile('video/mp4');
        expect(result).toBe(true);
      });

      it('should return false for non-video mime types', () => {
        const result = (service as any).isVideoFile('audio/mp3');
        expect(result).toBe(false);
      });
    });

    describe('getFileFormat', () => {
      it('should extract file extension correctly', () => {
        const result = (service as any).getFileFormat('test-video.mp4');
        expect(result).toBe('mp4');
      });

      it('should handle files without extension', () => {
        const result = (service as any).getFileFormat('testfile');
        expect(result).toBe('');
      });
    });
  });
});
