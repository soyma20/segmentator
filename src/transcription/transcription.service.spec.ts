import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TranscriptionService } from './transcription.service';
import {
  Transcription,
  TranscriptionStatus,
} from './schemas/transcription.schema';
import { TranscriptionSegment } from './schemas/transcription-segment.schema';
import { TranscriptionProvider } from '../common/enums/transcription-provider.enum';

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let mockTranscriptionModel: jest.Mocked<Model<Transcription>>;

  const mockTranscriptionData = {
    fileId: '507f1f77bcf86cd799439011',
    segments: [
      {
        _id: 'segment1',
        startTime: '00:00:00',
        endTime: '00:00:05',
        startSeconds: 0,
        endSeconds: 5,
        duration: 5,
        text: 'Hello world',
        wordCount: 2,
        avgConfidence: 0.95,
        speakerChange: false,
      },
      {
        _id: 'segment2',
        startTime: '00:00:05',
        endTime: '00:00:10',
        startSeconds: 5,
        endSeconds: 10,
        duration: 5,
        text: 'This is a test',
        wordCount: 4,
        avgConfidence: 0.88,
        speakerChange: true,
      },
    ],
    duration: 10,
    language: 'en-US',
    processingId: '507f1f77bcf86cd799439012',
  };

  const mockFailedTranscriptionData = {
    fileId: '507f1f77bcf86cd799439011',
    error: 'Audio processing failed',
    processingId: '507f1f77bcf86cd799439012',
  };

  beforeEach(async () => {
    const mockSegmentModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
    };

    // Mock the constructor to return an object with save method
    const mockTranscriptionConstructor = jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue({ _id: 'mock-id' }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptionService,
        {
          provide: getModelToken(Transcription.name),
          useValue: mockTranscriptionConstructor,
        },
        {
          provide: getModelToken(TranscriptionSegment.name),
          useValue: mockSegmentModel,
        },
      ],
    }).compile();

    service = module.get<TranscriptionService>(TranscriptionService);
    mockTranscriptionModel = module.get(getModelToken(Transcription.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTranscription', () => {
    it('should create transcription successfully', async () => {
      const mockSavedTranscription = {
        _id: new Types.ObjectId(),
        fileId: new Types.ObjectId(mockTranscriptionData.fileId),
        processingId: new Types.ObjectId(mockTranscriptionData.processingId),
        transcriptionProvider: TranscriptionProvider.GOOGLE_SPEECH,
        language: 'en',
        confidence: 0.915,
        segments: expect.any(Array),
        totalSegments: 2,
        totalWords: 5,
        fullText: 'Hello world This is a test',
        status: TranscriptionStatus.COMPLETED,
        completedAt: expect.any(Date),
      };

      // Mock the save method on the constructor's prototype
      (mockTranscriptionModel as any).prototype.save = jest
        .fn()
        .mockResolvedValue(mockSavedTranscription);

      const result = await service.createTranscription(mockTranscriptionData);

      expect(mockTranscriptionModel).toHaveBeenCalled();
      expect(result).toEqual(mockSavedTranscription);
      expect(result.totalSegments).toBe(2);
      expect(result.totalWords).toBe(5);
      expect(result.status).toBe(TranscriptionStatus.COMPLETED);
    });

    it('should handle empty segments', async () => {
      const emptySegmentsData = {
        ...mockTranscriptionData,
        segments: [],
      };

      const mockSavedTranscription = {
        _id: new Types.ObjectId(),
        fileId: new Types.ObjectId(emptySegmentsData.fileId),
        transcriptionProvider: TranscriptionProvider.GOOGLE_SPEECH,
        language: 'en',
        confidence: 0,
        segments: [],
        totalSegments: 0,
        totalWords: 0,
        fullText: '[No speech detected in audio]',
        status: TranscriptionStatus.COMPLETED,
        completedAt: expect.any(Date),
      };

      // Mock the save method on the constructor's prototype
      (mockTranscriptionModel as any).prototype.save = jest
        .fn()
        .mockResolvedValue(mockSavedTranscription);

      const result = await service.createTranscription(emptySegmentsData);

      expect(result.totalSegments).toBe(0);
      expect(result.totalWords).toBe(0);
      expect(result.fullText).toBe('[No speech detected in audio]');
    });

    it('should handle segments with no text', async () => {
      const noTextSegmentsData = {
        ...mockTranscriptionData,
        segments: [
          {
            _id: 'segment1',
            startTime: '00:00:00',
            endTime: '00:00:05',
            startSeconds: 0,
            endSeconds: 5,
            duration: 5,
            text: '',
            wordCount: 0,
            avgConfidence: 0.5,
            speakerChange: false,
          },
        ],
      };

      const mockSavedTranscription = {
        _id: new Types.ObjectId(),
        fileId: new Types.ObjectId(noTextSegmentsData.fileId),
        transcriptionProvider: TranscriptionProvider.GOOGLE_SPEECH,
        language: 'en',
        confidence: 0.5,
        segments: expect.any(Array),
        totalSegments: 1,
        totalWords: 0,
        fullText: '[No speech detected in audio]',
        status: TranscriptionStatus.COMPLETED,
        completedAt: expect.any(Date),
      };

      // Mock the save method on the constructor's prototype
      (mockTranscriptionModel as any).prototype.save = jest
        .fn()
        .mockResolvedValue(mockSavedTranscription);

      const result = await service.createTranscription(noTextSegmentsData);

      expect(result.totalWords).toBe(0);
      expect(result.fullText).toBe('[No speech detected in audio]');
    });

    it('should throw error when save fails', async () => {
      const error = new Error('Database error');
      (mockTranscriptionModel as any).prototype.save = jest
        .fn()
        .mockRejectedValue(error);

      await expect(
        service.createTranscription(mockTranscriptionData),
      ).rejects.toThrow('Database error');
    });
  });

  describe('createFailedTranscription', () => {
    it('should create failed transcription successfully', async () => {
      const mockSavedTranscription = {
        _id: new Types.ObjectId(),
        fileId: new Types.ObjectId(mockFailedTranscriptionData.fileId),
        processingId: new Types.ObjectId(
          mockFailedTranscriptionData.processingId,
        ),
        transcriptionProvider: TranscriptionProvider.GOOGLE_SPEECH,
        language: 'en',
        confidence: 0,
        segments: [],
        totalSegments: 0,
        totalWords: 0,
        fullText: `Transcription failed: ${mockFailedTranscriptionData.error}`,
        status: TranscriptionStatus.FAILED,
        error: mockFailedTranscriptionData.error,
        completedAt: expect.any(Date),
      };

      (mockTranscriptionModel as any).prototype.save = jest
        .fn()
        .mockResolvedValue(mockSavedTranscription);

      const result = await service.createFailedTranscription(
        mockFailedTranscriptionData,
      );

      expect((mockTranscriptionModel as any).prototype.save).toHaveBeenCalled();
      expect(result).toEqual(mockSavedTranscription);
      expect(result.status).toBe(TranscriptionStatus.FAILED);
      expect(result.error).toBe(mockFailedTranscriptionData.error);
    });

    it('should throw error when save fails', async () => {
      const error = new Error('Database error');
      (mockTranscriptionModel as any).prototype.save = jest
        .fn()
        .mockRejectedValue(error);

      await expect(
        service.createFailedTranscription(mockFailedTranscriptionData),
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTranscriptionByFileId', () => {
    it('should return transcription when found', async () => {
      const mockTranscription = {
        _id: new Types.ObjectId(),
        fileId: new Types.ObjectId(mockTranscriptionData.fileId),
        status: TranscriptionStatus.COMPLETED,
      };

      const mockQuery = {
        exec: jest.fn().mockResolvedValue(mockTranscription),
      };

      (mockTranscriptionModel as any).findOne.mockReturnValue(mockQuery);

      const result = await service.getTranscriptionByFileId(
        mockTranscriptionData.fileId,
      );

      expect((mockTranscriptionModel as any).findOne).toHaveBeenCalledWith({
        fileId: new Types.ObjectId(mockTranscriptionData.fileId),
      });
      expect(result).toEqual(mockTranscription);
    });

    it('should return null when transcription not found', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue(null),
      };

      (mockTranscriptionModel as any).findOne.mockReturnValue(mockQuery);

      const result = await service.getTranscriptionByFileId('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getTranscriptionById', () => {
    it('should return transcription when found', async () => {
      const mockTranscription = {
        _id: new Types.ObjectId(),
        fileId: new Types.ObjectId(mockTranscriptionData.fileId),
        status: TranscriptionStatus.COMPLETED,
      };

      (mockTranscriptionModel as any).findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTranscription),
      });

      const result = await service.getTranscriptionById('transcription-id');

      expect((mockTranscriptionModel as any).findById).toHaveBeenCalledWith(
        'transcription-id',
      );
      expect(result).toEqual(mockTranscription);
    });

    it('should return null when transcription not found', async () => {
      (mockTranscriptionModel as any).findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getTranscriptionById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateTranscriptionStatus', () => {
    it('should update transcription status to completed', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue({ acknowledged: true }),
      };

      (mockTranscriptionModel as any).updateOne.mockReturnValue(mockQuery);

      await service.updateTranscriptionStatus(
        'transcription-id',
        TranscriptionStatus.COMPLETED,
      );

      expect((mockTranscriptionModel as any).updateOne).toHaveBeenCalledWith(
        { _id: 'transcription-id' },
        {
          status: TranscriptionStatus.COMPLETED,
          error: undefined,
          completedAt: expect.any(Date),
        },
      );
    });

    it('should update transcription status to failed with error', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue({ acknowledged: true }),
      };

      (mockTranscriptionModel as any).updateOne.mockReturnValue(mockQuery);

      await service.updateTranscriptionStatus(
        'transcription-id',
        TranscriptionStatus.FAILED,
        'Processing error',
      );

      expect((mockTranscriptionModel as any).updateOne).toHaveBeenCalledWith(
        { _id: 'transcription-id' },
        {
          status: TranscriptionStatus.FAILED,
          error: 'Processing error',
        },
      );
    });
  });

  describe('private methods', () => {
    describe('countWords', () => {
      it('should count words correctly', () => {
        const result = (
          service as unknown as { countWords: (text: string) => number }
        ).countWords('Hello world test');
        expect(result).toBe(3);
      });

      it('should return 0 for empty text', () => {
        const result = (
          service as unknown as { countWords: (text: string) => number }
        ).countWords('');
        expect(result).toBe(0);
      });

      it('should return 0 for placeholder text', () => {
        const result = (
          service as unknown as { countWords: (text: string) => number }
        ).countWords('[No speech detected]');
        expect(result).toBe(0);
      });

      it('should handle multiple spaces', () => {
        const result = (
          service as unknown as { countWords: (text: string) => number }
        ).countWords('Hello    world   test');
        expect(result).toBe(3);
      });
    });

    describe('secondsToTimeString', () => {
      it('should convert seconds to time string correctly', () => {
        const result = (
          service as unknown as {
            secondsToTimeString: (seconds: number) => string;
          }
        ).secondsToTimeString(3661); // 1 hour, 1 minute, 1 second
        expect(result).toBe('01:01:01');
      });

      it('should handle zero seconds', () => {
        const result = (
          service as unknown as {
            secondsToTimeString: (seconds: number) => string;
          }
        ).secondsToTimeString(0);
        expect(result).toBe('00:00:00');
      });

      it('should handle large values', () => {
        const result = (
          service as unknown as {
            secondsToTimeString: (seconds: number) => string;
          }
        ).secondsToTimeString(7325); // 2 hours, 2 minutes, 5 seconds
        expect(result).toBe('02:02:05');
      });
    });

    describe('detectSpeakerChange', () => {
      it('should detect speaker change based on time gap', () => {
        const prevSegment = {
          endSeconds: 5,
          avgConfidence: 0.9,
        };
        const currentSegment = {
          startSeconds: 8, // 3 second gap
          avgConfidence: 0.9,
        };

        const result = (
          service as unknown as {
            detectSpeakerChange: (
              prev: TranscriptionSegment,
              curr: TranscriptionSegment,
            ) => boolean;
          }
        ).detectSpeakerChange(
          prevSegment as TranscriptionSegment,
          currentSegment as TranscriptionSegment,
        );
        expect(result).toBe(true);
      });

      it('should detect speaker change based on confidence difference', () => {
        const prevSegment = {
          endSeconds: 5,
          avgConfidence: 0.9,
        };
        const currentSegment = {
          startSeconds: 5.5, // Small gap
          avgConfidence: 0.5, // Large confidence difference
        };

        const result = (
          service as unknown as {
            detectSpeakerChange: (
              prev: TranscriptionSegment,
              curr: TranscriptionSegment,
            ) => boolean;
          }
        ).detectSpeakerChange(
          prevSegment as TranscriptionSegment,
          currentSegment as TranscriptionSegment,
        );
        expect(result).toBe(true);
      });

      it('should not detect speaker change for normal segments', () => {
        const prevSegment = {
          endSeconds: 5,
          avgConfidence: 0.9,
        };
        const currentSegment = {
          startSeconds: 5.5, // Small gap
          avgConfidence: 0.85, // Small confidence difference
        };

        const result = (
          service as unknown as {
            detectSpeakerChange: (
              prev: TranscriptionSegment,
              curr: TranscriptionSegment,
            ) => boolean;
          }
        ).detectSpeakerChange(
          prevSegment as TranscriptionSegment,
          currentSegment as TranscriptionSegment,
        );
        expect(result).toBe(false);
      });
    });
  });
});
