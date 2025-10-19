import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import {
  ProcessingController,
  TriggerClippingDto,
} from './processing.controller';
import { ProcessingService } from './processing.service';

describe('ProcessingController', () => {
  let controller: ProcessingController;
  let processingService: jest.Mocked<ProcessingService>;

  const mockAnalysisId = '507f1f77bcf86cd799439011';
  const mockClippingJobStatus = {
    id: 'job-123',
    status: 'completed',
    progress: 100,
    result: {
      analysisId: mockAnalysisId,
      clipsCreated: 1,
      clipPaths: ['/clips/clip1.mp4'],
      status: 'completed' as const,
    },
    error: undefined,
    createdAt: 1234567890,
    processedAt: 1234567891,
  };

  beforeEach(async () => {
    const mockProcessingService = {
      triggerClippingJob: jest.fn().mockResolvedValue(undefined),
      getClippingJobStatus: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessingController],
      providers: [
        {
          provide: ProcessingService,
          useValue: mockProcessingService,
        },
      ],
    }).compile();

    controller = module.get<ProcessingController>(ProcessingController);
    processingService = module.get(ProcessingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triggerClipping', () => {
    const validDto: TriggerClippingDto = {
      analysisId: mockAnalysisId,
      maxClips: 5,
      minScoreThreshold: 7,
    };

    it('should trigger clipping job successfully', async () => {
      processingService.triggerClippingJob.mockResolvedValue(undefined);

      const result = await controller.triggerClipping(validDto);

      expect(processingService.triggerClippingJob).toHaveBeenCalledWith(
        validDto.analysisId,
        {
          maxClips: validDto.maxClips,
          minScoreThreshold: validDto.minScoreThreshold,
        },
      );

      expect(result).toEqual({
        message: 'Clipping job triggered successfully',
        analysisId: validDto.analysisId,
      });
    });

    it('should trigger clipping job with only analysisId', async () => {
      const minimalDto: TriggerClippingDto = {
        analysisId: mockAnalysisId,
      };

      processingService.triggerClippingJob.mockResolvedValue(undefined);

      const result = await controller.triggerClipping(minimalDto);

      expect(processingService.triggerClippingJob).toHaveBeenCalledWith(
        minimalDto.analysisId,
        {
          maxClips: undefined,
          minScoreThreshold: undefined,
        },
      );

      expect(result).toEqual({
        message: 'Clipping job triggered successfully',
        analysisId: minimalDto.analysisId,
      });
    });

    it('should trigger clipping job with only maxClips', async () => {
      const partialDto: TriggerClippingDto = {
        analysisId: mockAnalysisId,
        maxClips: 3,
      };

      processingService.triggerClippingJob.mockResolvedValue(undefined);

      const result = await controller.triggerClipping(partialDto);

      expect(processingService.triggerClippingJob).toHaveBeenCalledWith(
        partialDto.analysisId,
        {
          maxClips: 3,
          minScoreThreshold: undefined,
        },
      );

      expect(result).toEqual({
        message: 'Clipping job triggered successfully',
        analysisId: partialDto.analysisId,
      });
    });

    it('should trigger clipping job with only minScoreThreshold', async () => {
      const partialDto: TriggerClippingDto = {
        analysisId: mockAnalysisId,
        minScoreThreshold: 8,
      };

      processingService.triggerClippingJob.mockResolvedValue(undefined);

      const result = await controller.triggerClipping(partialDto);

      expect(processingService.triggerClippingJob).toHaveBeenCalledWith(
        partialDto.analysisId,
        {
          maxClips: undefined,
          minScoreThreshold: 8,
        },
      );

      expect(result).toEqual({
        message: 'Clipping job triggered successfully',
        analysisId: partialDto.analysisId,
      });
    });

    it('should handle service errors', async () => {
      const serviceError = new Error('Analysis result not found');
      processingService.triggerClippingJob.mockRejectedValue(serviceError);

      await expect(controller.triggerClipping(validDto)).rejects.toThrow(
        HttpException,
      );

      await expect(controller.triggerClipping(validDto)).rejects.toThrow(
        'Failed to trigger clipping job: Analysis result not found',
      );
    });

    it('should handle unknown errors', async () => {
      processingService.triggerClippingJob.mockRejectedValue('String error');

      await expect(controller.triggerClipping(validDto)).rejects.toThrow(
        HttpException,
      );

      await expect(controller.triggerClipping(validDto)).rejects.toThrow(
        'Failed to trigger clipping job: Unknown error',
      );
    });

    it('should handle non-Error exceptions', async () => {
      processingService.triggerClippingJob.mockRejectedValue({
        code: 'DB_ERROR',
      });

      await expect(controller.triggerClipping(validDto)).rejects.toThrow(
        HttpException,
      );

      await expect(controller.triggerClipping(validDto)).rejects.toThrow(
        'Failed to trigger clipping job: Unknown error',
      );
    });
  });

  describe('getClippingStatus', () => {
    it('should return clipping job status when job exists', async () => {
      processingService.getClippingJobStatus.mockResolvedValue(
        mockClippingJobStatus,
      );

      const result = await controller.getClippingStatus(mockAnalysisId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(processingService.getClippingJobStatus).toHaveBeenCalledWith(
        mockAnalysisId,
      );

      expect(result).toEqual({
        analysisId: mockAnalysisId,
        ...mockClippingJobStatus,
      });
    });

    it('should return not found message when job does not exist', async () => {
      processingService.getClippingJobStatus.mockResolvedValue(null);

      const result = await controller.getClippingStatus(mockAnalysisId);

      expect(processingService.getClippingJobStatus).toHaveBeenCalledWith(
        mockAnalysisId,
      );

      expect(result).toEqual({
        message: 'No clipping job found for this analysis',
        analysisId: mockAnalysisId,
      });
    });

    it('should return job status for active job', async () => {
      const activeJobStatus = {
        ...mockClippingJobStatus,
        status: 'active',
        progress: 50,
        result: undefined,
        processedAt: undefined,
      };

      processingService.getClippingJobStatus.mockResolvedValue(activeJobStatus);

      const result = await controller.getClippingStatus(mockAnalysisId);

      expect(result).toEqual({
        analysisId: mockAnalysisId,
        ...activeJobStatus,
      });
    });

    it('should return job status for failed job', async () => {
      const failedJobStatus = {
        ...mockClippingJobStatus,
        status: 'failed',
        progress: 75,
        result: undefined,
        error: 'Processing failed',
        processedAt: undefined,
      };

      processingService.getClippingJobStatus.mockResolvedValue(failedJobStatus);

      const result = await controller.getClippingStatus(mockAnalysisId);

      expect(result).toEqual({
        analysisId: mockAnalysisId,
        ...failedJobStatus,
      });
    });

    it('should throw BadRequestException for invalid analysis ID', async () => {
      const invalidAnalysisId = 'invalid-id';

      await expect(
        controller.getClippingStatus(invalidAnalysisId),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.getClippingStatus(invalidAnalysisId),
      ).rejects.toThrow(
        'Invalid analysis ID format: invalid-id. Must be a valid MongoDB ObjectId.',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(processingService.getClippingJobStatus).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      const serviceError = new Error('Queue connection failed');
      processingService.getClippingJobStatus.mockRejectedValue(serviceError);

      await expect(
        controller.getClippingStatus(mockAnalysisId),
      ).rejects.toThrow(serviceError);
    });

    it('should handle empty analysis ID', async () => {
      await expect(controller.getClippingStatus('')).rejects.toThrow(
        HttpException,
      );

      await expect(controller.getClippingStatus('')).rejects.toThrow(
        'Invalid analysis ID format: . Must be a valid MongoDB ObjectId.',
      );
    });

    it('should handle null analysis ID', async () => {
      await expect(
        controller.getClippingStatus(null as unknown as string),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.getClippingStatus(null as unknown as string),
      ).rejects.toThrow(
        'Invalid analysis ID format: null. Must be a valid MongoDB ObjectId.',
      );
    });

    it('should handle undefined analysis ID', async () => {
      await expect(
        controller.getClippingStatus(undefined as unknown as string),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.getClippingStatus(undefined as unknown as string),
      ).rejects.toThrow(
        'Invalid analysis ID format: undefined. Must be a valid MongoDB ObjectId.',
      );
    });
  });

  describe('TriggerClippingDto validation', () => {
    it('should accept valid DTO with all fields', () => {
      const validDto: TriggerClippingDto = {
        analysisId: '507f1f77bcf86cd799439011',
        maxClips: 10,
        minScoreThreshold: 5,
      };

      expect(validDto.analysisId).toBe('507f1f77bcf86cd799439011');
      expect(validDto.maxClips).toBe(10);
      expect(validDto.minScoreThreshold).toBe(5);
    });

    it('should accept valid DTO with only required fields', () => {
      const validDto: TriggerClippingDto = {
        analysisId: '507f1f77bcf86cd799439011',
      };

      expect(validDto.analysisId).toBe('507f1f77bcf86cd799439011');
      expect(validDto.maxClips).toBeUndefined();
      expect(validDto.minScoreThreshold).toBeUndefined();
    });

    it('should accept valid DTO with minimum values', () => {
      const validDto: TriggerClippingDto = {
        analysisId: '507f1f77bcf86cd799439011',
        maxClips: 1,
        minScoreThreshold: 1,
      };

      expect(validDto.maxClips).toBe(1);
      expect(validDto.minScoreThreshold).toBe(1);
    });

    it('should accept valid DTO with maximum values', () => {
      const validDto: TriggerClippingDto = {
        analysisId: '507f1f77bcf86cd799439011',
        maxClips: 50,
        minScoreThreshold: 10,
      };

      expect(validDto.maxClips).toBe(50);
      expect(validDto.minScoreThreshold).toBe(10);
    });
  });
});
