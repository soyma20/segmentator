import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProcessingService } from './processing.service';
import { AnalysisResult } from '../analysis/schemas/analysis.schema';
import { Queue } from 'bullmq';
import { ClippingJobResult } from './processors/clipping.processor';

describe('ProcessingService', () => {
  let service: ProcessingService;
  let mockClippingQueue: jest.Mocked<Queue>;
  let mockAnalysisResultModel: jest.Mocked<Model<AnalysisResult>>;

  const mockAnalysisId = '507f1f77bcf86cd799439011';
  const mockProcessingHistory = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    configuration: {
      clippingConfig: {
        maxClips: 10,
        minScoreThreshold: 5,
      },
    },
  };

  const mockAnalysisResult = {
    _id: new Types.ObjectId(mockAnalysisId),
    processingId: mockProcessingHistory,
    segments: [],
    totalSegments: 0,
    createdAt: new Date(),
  };

  const mockClippingJobResult: ClippingJobResult = {
    analysisId: mockAnalysisId,
    clipsCreated: 1,
    clipPaths: ['/clips/clip1.mp4'],
    status: 'completed',
  };

  beforeEach(async () => {
    const mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      getJobs: jest.fn().mockResolvedValue([]),
    };

    const mockModel = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessingService,
        {
          provide: 'BullQueue_clipping',
          useValue: mockQueue,
        },
        {
          provide: getModelToken(AnalysisResult.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<ProcessingService>(ProcessingService);
    mockClippingQueue = module.get('BullQueue_clipping');
    mockAnalysisResultModel = module.get(getModelToken(AnalysisResult.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triggerClippingJob', () => {
    it('should trigger clipping job successfully with default options', async () => {
      mockAnalysisResultModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockAnalysisResult),
        }),
      } as any);

      mockClippingQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      await service.triggerClippingJob(mockAnalysisId);

      expect(mockAnalysisResultModel.findById).toHaveBeenCalledWith(
        mockAnalysisId,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClippingQueue.add).toHaveBeenCalledWith(
        'clip-video',
        {
          analysisResult: { _id: mockAnalysisId },
          maxClips: 10,
          minScoreThreshold: 5,
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
    });

    it('should trigger clipping job with override options', async () => {
      mockAnalysisResultModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockAnalysisResult),
        }),
      } as any);

      mockClippingQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const overrideOptions = {
        maxClips: 5,
        minScoreThreshold: 7,
      };

      await service.triggerClippingJob(mockAnalysisId, overrideOptions);

      expect(mockClippingQueue.add).toHaveBeenCalledWith(
        'clip-video',
        {
          analysisResult: { _id: mockAnalysisId },
          maxClips: 5,
          minScoreThreshold: 7,
        },
        expect.any(Object),
      );
    });

    it('should trigger clipping job with partial override options', async () => {
      mockAnalysisResultModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockAnalysisResult),
        }),
      } as any);

      mockClippingQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const partialOptions = {
        maxClips: 3,
      };

      await service.triggerClippingJob(mockAnalysisId, partialOptions);

      expect(mockClippingQueue.add).toHaveBeenCalledWith(
        'clip-video',
        {
          analysisResult: { _id: mockAnalysisId },
          maxClips: 3,
          minScoreThreshold: 5, // Should use default from config
        },
        expect.any(Object),
      );
    });

    it('should throw error for invalid analysis ID', async () => {
      await expect(service.triggerClippingJob('invalid-id')).rejects.toThrow(
        'Invalid analysis ID format: invalid-id. Must be a valid MongoDB ObjectId.',
      );
    });

    it('should throw error when analysis result not found', async () => {
      mockAnalysisResultModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      } as any);

      await expect(service.triggerClippingJob(mockAnalysisId)).rejects.toThrow(
        `Analysis result not found: ${mockAnalysisId}`,
      );
    });

    it('should handle queue add failure', async () => {
      mockAnalysisResultModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockAnalysisResult),
        }),
      } as any);

      const queueError = new Error('Queue connection failed');
      mockClippingQueue.add.mockRejectedValue(queueError);

      await expect(service.triggerClippingJob(mockAnalysisId)).rejects.toThrow(
        'Queue connection failed',
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockAnalysisResultModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockRejectedValue(dbError),
        }),
      } as any);

      await expect(service.triggerClippingJob(mockAnalysisId)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('getClippingJobStatus', () => {
    it('should return job status when job exists', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          analysisResult: { _id: mockAnalysisId },
        },
        getState: jest.fn().mockResolvedValue('completed'),
        progress: 100,
        returnvalue: mockClippingJobResult,
        failedReason: null,
        timestamp: 1234567890,
        processedOn: 1234567891,
      };

      mockClippingQueue.getJobs.mockResolvedValue([mockJob] as any);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result).toEqual({
        id: 'job-123',
        status: 'completed',
        progress: 100,
        result: mockClippingJobResult,
        error: undefined,
        createdAt: 1234567890,
        processedAt: 1234567891,
      });
    });

    it('should return job status for failed job', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          analysisResult: { _id: mockAnalysisId },
        },
        getState: jest.fn().mockResolvedValue('failed'),
        progress: 50,
        returnvalue: null,
        failedReason: 'Processing failed',
        timestamp: 1234567890,
        processedOn: null,
      };

      mockClippingQueue.getJobs.mockResolvedValue([mockJob] as any);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result).toEqual({
        id: 'job-123',
        status: 'failed',
        progress: 50,
        result: null,
        error: 'Processing failed',
        createdAt: 1234567890,
        processedAt: undefined,
      });
    });

    it('should return job status for active job', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          analysisResult: { _id: mockAnalysisId },
        },
        getState: jest.fn().mockResolvedValue('active'),
        progress: 75,
        returnvalue: null,
        failedReason: null,
        timestamp: 1234567890,
        processedOn: 1234567891,
      };

      mockClippingQueue.getJobs.mockResolvedValue([mockJob] as any);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result).toEqual({
        id: 'job-123',
        status: 'active',
        progress: 75,
        result: null,
        error: undefined,
        createdAt: 1234567890,
        processedAt: 1234567891,
      });
    });

    it('should return null when job not found', async () => {
      mockClippingQueue.getJobs.mockResolvedValue([]);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result).toBeNull();
    });

    it('should return null when job exists but for different analysis', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          analysisResult: { _id: 'different-analysis-id' },
        },
        getState: jest.fn().mockResolvedValue('completed'),
        progress: 100,
        returnvalue: mockClippingJobResult,
        failedReason: null,
        timestamp: 1234567890,
        processedOn: 1234567891,
      };

      mockClippingQueue.getJobs.mockResolvedValue([mockJob] as any);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result).toBeNull();
    });

    it('should throw error for invalid analysis ID', async () => {
      await expect(service.getClippingJobStatus('invalid-id')).rejects.toThrow(
        'Invalid analysis ID format: invalid-id. Must be a valid MongoDB ObjectId.',
      );
    });

    it('should handle non-numeric progress', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          analysisResult: { _id: mockAnalysisId },
        },
        getState: jest.fn().mockResolvedValue('active'),
        progress: 'processing', // Non-numeric progress
        returnvalue: null,
        failedReason: null,
        timestamp: 1234567890,
        processedOn: 1234567891,
      };

      mockClippingQueue.getJobs.mockResolvedValue([mockJob] as any);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result?.progress).toBe(0);
    });

    it('should handle missing job properties', async () => {
      const mockJob = {
        data: {
          analysisResult: { _id: mockAnalysisId },
        },
        getState: jest.fn().mockResolvedValue('completed'),
        progress: 100,
        returnvalue: mockClippingJobResult,
        failedReason: null,
        timestamp: null,
        processedOn: null,
      };

      mockClippingQueue.getJobs.mockResolvedValue([mockJob] as any);

      const result = await service.getClippingJobStatus(mockAnalysisId);

      expect(result).toEqual({
        id: 'unknown',
        status: 'completed',
        progress: 100,
        result: mockClippingJobResult,
        error: undefined,
        createdAt: 0,
        processedAt: undefined,
      });
    });

    it('should handle queue getJobs failure', async () => {
      const queueError = new Error('Queue connection failed');
      mockClippingQueue.getJobs.mockRejectedValue(queueError);

      await expect(
        service.getClippingJobStatus(mockAnalysisId),
      ).rejects.toThrow('Queue connection failed');
    });
  });
});
