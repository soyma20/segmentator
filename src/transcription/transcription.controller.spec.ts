import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { TranscriptionController } from './transcription.controller';
import { File } from '../files/schemas/file.schema';
import { ProcessingHistory } from '../processing/schemas/processing-history.schema';
import { TriggerTranscriptionDto } from './dto/trigger-transcription.dto';
import { Queue } from 'bullmq';

describe('TranscriptionController', () => {
  let controller: TranscriptionController;
  let mockTranscriptionQueue: jest.Mocked<Queue>;
  let mockFileModel: jest.Mocked<Model<File>>;
  let mockProcessingHistoryModel: jest.Mocked<Model<ProcessingHistory>>;

  const mockFile = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    originalName: 'test-video.mp4',
    filePath: '/uploads/test-video.mp4',
    mimeType: 'video/mp4',
    duration: 120,
    fileSize: 1024000,
    storageType: 'local',
    uploadedAt: new Date(),
  };

  const mockProcessingHistory = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    fileId: '507f1f77bcf86cd799439011',
    processingStartedAt: new Date(),
    processingStatus: 'pending',
    configuration: {},
  };

  const mockTriggerDto: TriggerTranscriptionDto = {
    fileId: '507f1f77bcf86cd799439011',
    languageCode: 'en-US',
  };

  beforeEach(async () => {
    const mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const mockModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscriptionController],
      providers: [
        {
          provide: 'BullQueue_transcription',
          useValue: mockQueue,
        },
        {
          provide: getModelToken(File.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(ProcessingHistory.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    controller = module.get<TranscriptionController>(TranscriptionController);
    mockTranscriptionQueue = module.get('BullQueue_transcription');
    mockFileModel = module.get(getModelToken(File.name));
    mockProcessingHistoryModel = module.get(
      getModelToken(ProcessingHistory.name),
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triggerTranscription', () => {
    it('should trigger transcription successfully with processing history', async () => {
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockFile),
      } as any);

      mockProcessingHistoryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProcessingHistory),
      } as any);

      mockTranscriptionQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const result = await controller.triggerTranscription(mockTriggerDto);

      expect(mockFileModel.findById).toHaveBeenCalledWith(
        mockTriggerDto.fileId,
      );
      expect(mockProcessingHistoryModel.findOne).toHaveBeenCalledWith({
        fileId: mockTriggerDto.fileId,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'transcribe-file',
        {
          fileId: mockTriggerDto.fileId,
          filePath: mockFile.filePath,
          originalName: mockFile.originalName,
          mimeType: mockFile.mimeType,
          duration: mockFile.duration,
          languageCode: mockTriggerDto.languageCode,
          processingId: String(mockProcessingHistory._id),
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );

      expect(result).toEqual({
        message: 'Transcription job queued successfully',
        fileId: mockTriggerDto.fileId,
        fileName: mockFile.originalName,
        languageCode: mockTriggerDto.languageCode,
        hasProcessingHistory: true,
      });
    });

    it('should trigger transcription successfully without processing history', async () => {
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockFile),
      } as any);

      mockProcessingHistoryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      mockTranscriptionQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const result = await controller.triggerTranscription(mockTriggerDto);

      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'transcribe-file',
        {
          fileId: mockTriggerDto.fileId,
          filePath: mockFile.filePath,
          originalName: mockFile.originalName,
          mimeType: mockFile.mimeType,
          duration: mockFile.duration,
          languageCode: mockTriggerDto.languageCode,
          processingId: undefined,
        },
        expect.any(Object),
      );

      expect(result.hasProcessingHistory).toBe(false);
    });

    it('should use default language code when not provided', async () => {
      const dtoWithoutLanguage = {
        fileId: '507f1f77bcf86cd799439011',
      };

      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockFile),
      } as any);

      mockProcessingHistoryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      mockTranscriptionQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const result = await controller.triggerTranscription(dtoWithoutLanguage);

      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'transcribe-file',
        expect.objectContaining({
          languageCode: 'en',
        }),
        expect.any(Object),
      );

      expect(result.languageCode).toBe('en');
    });

    it('should throw BadRequestException for invalid file ID', async () => {
      const invalidDto = {
        fileId: 'invalid-id',
        languageCode: 'en-US',
      };

      await expect(controller.triggerTranscription(invalidDto)).rejects.toThrow(
        HttpException,
      );

      await expect(controller.triggerTranscription(invalidDto)).rejects.toThrow(
        'Invalid file ID format: invalid-id. Must be a valid MongoDB ObjectId.',
      );
    });

    it('should throw NotFoundException when file not found', async () => {
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow('File not found: 507f1f77bcf86cd799439011');
    });

    it('should handle queue add failure', async () => {
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockFile),
      } as any);

      mockProcessingHistoryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      const queueError = new Error('Queue connection failed');
      mockTranscriptionQueue.add.mockRejectedValue(queueError);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(
        'Failed to queue transcription job: Queue connection failed',
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockRejectedValue(dbError),
      } as any);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(
        'Failed to queue transcription job: Database connection failed',
      );
    });

    it('should handle unknown errors', async () => {
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockFile),
      } as any);

      mockProcessingHistoryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      // Mock a non-Error object being thrown
      mockTranscriptionQueue.add.mockRejectedValue('String error');

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow('Failed to queue transcription job: Unknown error');
    });

    it('should preserve HttpException errors', async () => {
      const httpError = new HttpException(
        'Custom error',
        HttpStatus.BAD_REQUEST,
      );
      mockFileModel.findById.mockReturnValue({
        exec: jest.fn().mockRejectedValue(httpError),
      } as any);

      await expect(
        controller.triggerTranscription(mockTriggerDto),
      ).rejects.toThrow(httpError);
    });
  });
});
