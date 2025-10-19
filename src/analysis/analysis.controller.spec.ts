import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AnalysisController, ReRunAnalysisDto } from './analysis.controller';

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let mockAnalysisQueue: any;

  beforeEach(async () => {
    const mockQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
        {
          provide: 'BullQueue_analysis',
          useValue: mockQueue,
        },
      ],
    }).compile();

    controller = module.get<AnalysisController>(AnalysisController);
    mockAnalysisQueue = module.get('BullQueue_analysis');
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('reRunAnalysis', () => {
    it('should queue analysis job successfully', async () => {
      const dto: ReRunAnalysisDto = {
        transcriptionId: 'transcription-id',
      };

      mockAnalysisQueue.add.mockResolvedValue({ id: 'job-id' });

      const result = await controller.reRunAnalysis(dto);

      expect(mockAnalysisQueue.add).toHaveBeenCalledWith(
        'analyze-segments',
        {
          transcription: { _id: dto.transcriptionId },
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
        message: 'Analysis job queued successfully',
        transcriptionId: dto.transcriptionId,
      });
    });

    it('should handle queue errors', async () => {
      const dto: ReRunAnalysisDto = {
        transcriptionId: 'transcription-id',
      };

      const queueError = new Error('Queue connection failed');
      mockAnalysisQueue.add.mockRejectedValue(queueError);

      await expect(controller.reRunAnalysis(dto)).rejects.toThrow(
        HttpException,
      );

      await expect(controller.reRunAnalysis(dto)).rejects.toThrow(
        'Failed to queue analysis job: Queue connection failed',
      );
    });

    it('should handle unknown errors', async () => {
      const dto: ReRunAnalysisDto = {
        transcriptionId: 'transcription-id',
      };

      mockAnalysisQueue.add.mockRejectedValue('Unknown error');

      await expect(controller.reRunAnalysis(dto)).rejects.toThrow(
        HttpException,
      );

      await expect(controller.reRunAnalysis(dto)).rejects.toThrow(
        'Failed to queue analysis job: Unknown error',
      );
    });

    it('should handle empty transcription ID', async () => {
      const dto: ReRunAnalysisDto = {
        transcriptionId: '',
      };

      mockAnalysisQueue.add.mockResolvedValue({ id: 'job-id' });

      const result = await controller.reRunAnalysis(dto);

      expect(mockAnalysisQueue.add).toHaveBeenCalledWith(
        'analyze-segments',
        {
          transcription: { _id: '' },
        },
        expect.any(Object),
      );

      expect(result).toEqual({
        message: 'Analysis job queued successfully',
        transcriptionId: '',
      });
    });
  });
});
