import { Test, TestingModule } from '@nestjs/testing';
import { FfmpegService, Timecode } from './ffmpeg.service';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import ffmpeg from 'fluent-ffmpeg';

// Mock fluent-ffmpeg
jest.mock('fluent-ffmpeg', () => {
  return jest.fn(() => ({
    noVideo: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioFrequency: jest.fn().mockReturnThis(),
    audioChannels: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    seekInput: jest.fn().mockReturnThis(),
    duration: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    run: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
  }));
});

// Mock fs modules
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

describe('FfmpegService', () => {
  let service: FfmpegService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FfmpegService],
    }).compile();

    service = module.get<FfmpegService>(FfmpegService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      await service.ensureDir('/path/to/directory');

      expect(fsSync.existsSync).toHaveBeenCalledWith('/path/to/directory');
      expect(fs.mkdir).toHaveBeenCalledWith('/path/to/directory', {
        recursive: true,
      });
    });

    it('should not create directory if it already exists', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);

      await service.ensureDir('/path/to/directory');

      expect(fsSync.existsSync).toHaveBeenCalledWith('/path/to/directory');
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should throw error when directory creation fails', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(false);
      const error = new Error('Permission denied');
      (fs.mkdir as jest.Mock).mockRejectedValue(error);

      await expect(service.ensureDir('/path/to/directory')).rejects.toThrow(
        'Permission denied',
      );
    });

    it('should handle non-Error exceptions', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdir as jest.Mock).mockRejectedValue('String error');

      await expect(service.ensureDir('/path/to/directory')).rejects.toThrow(
        'String error',
      );
    });
  });

  describe('convertVideoToAudio', () => {
    let mockFfmpeg: any;

    beforeEach(() => {
      mockFfmpeg = ffmpeg();
    });

    it('should convert video to audio successfully', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);

      // Mock successful conversion
      mockFfmpeg.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
          return mockFfmpeg;
        },
      );

      const result = await service.convertVideoToAudio(
        '/input/video.mp4',
        '/output/audio.wav',
      );

      expect(result).toBe('/output/audio.wav');
      expect(mockFfmpeg.noVideo).toHaveBeenCalled();
      expect(mockFfmpeg.audioCodec).toHaveBeenCalledWith('pcm_s16le');
      expect(mockFfmpeg.audioFrequency).toHaveBeenCalledWith(16000);
      expect(mockFfmpeg.audioChannels).toHaveBeenCalledWith(1);
      expect(mockFfmpeg.save).toHaveBeenCalledWith('/output/audio.wav');
    });

    it('should create output directory if it does not exist', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      mockFfmpeg.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
          return mockFfmpeg;
        },
      );

      await service.convertVideoToAudio(
        '/input/video.mp4',
        '/output/audio.wav',
      );

      expect(fs.mkdir).toHaveBeenCalledWith('/output', { recursive: true });
    });

    it('should handle conversion errors', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);

      const conversionError = new Error('FFmpeg conversion failed');
      mockFfmpeg.on.mockImplementation(
        (event: string, callback: (error?: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(conversionError), 0);
          }
          return mockFfmpeg;
        },
      );

      await expect(
        service.convertVideoToAudio('/input/video.mp4', '/output/audio.wav'),
      ).rejects.toThrow('FFmpeg conversion failed');
    });
  });

  describe('cutMediaByTimecodes', () => {
    let mockFfmpeg: any;

    beforeEach(() => {
      mockFfmpeg = ffmpeg();
    });

    const mockTimecodes: Timecode[] = [
      { start: '00:00:10', end: '00:00:20' },
      { start: '00:00:30', end: '00:00:40' },
    ];

    it('should cut media by timecodes successfully', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);

      mockFfmpeg.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
          return mockFfmpeg;
        },
      );

      const result = await service.cutMediaByTimecodes(
        '/input/video.mp4',
        mockTimecodes,
        '/output/segment_%i.mp4',
      );

      expect(result).toEqual([
        '/output/segment_1.mp4',
        '/output/segment_2.mp4',
      ]);

      expect(mockFfmpeg.seekInput).toHaveBeenCalledTimes(2);
      expect(mockFfmpeg.duration).toHaveBeenCalledTimes(2);
      expect(mockFfmpeg.output).toHaveBeenCalledTimes(2);
      expect(mockFfmpeg.run).toHaveBeenCalledTimes(2);
    });

    it('should create output directory if it does not exist', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      mockFfmpeg.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
          return mockFfmpeg;
        },
      );

      await service.cutMediaByTimecodes(
        '/input/video.mp4',
        mockTimecodes,
        '/output/segment_%i.mp4',
      );

      expect(fs.mkdir).toHaveBeenCalledWith('/output', { recursive: true });
    });

    it('should skip invalid timecodes', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);

      const invalidTimecodes: Timecode[] = [
        { start: '00:00:20', end: '00:00:10' }, // Invalid: end before start
        { start: '00:00:30', end: '00:00:40' }, // Valid
      ];

      mockFfmpeg.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
          return mockFfmpeg;
        },
      );

      const result = await service.cutMediaByTimecodes(
        '/input/video.mp4',
        invalidTimecodes,
        '/output/segment_%i.mp4',
      );

      expect(result).toEqual([
        '/output/segment_1.mp4',
        '/output/segment_2.mp4',
      ]);

      // Only one segment should be processed (the valid one)
      expect(mockFfmpeg.run).toHaveBeenCalledTimes(1);
    });

    it('should handle cutting errors', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);

      const cuttingError = new Error('FFmpeg cutting failed');
      mockFfmpeg.on.mockImplementation(
        (event: string, callback: (error?: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(cuttingError), 0);
          }
          return mockFfmpeg;
        },
      );

      await expect(
        service.cutMediaByTimecodes(
          '/input/video.mp4',
          mockTimecodes,
          '/output/segment_%i.mp4',
        ),
      ).rejects.toThrow('FFmpeg cutting failed');
    });
  });

  describe('private methods', () => {
    describe('calculateDuration', () => {
      it('should calculate duration correctly', () => {
        const result = (service as any).calculateDuration(
          '00:00:10',
          '00:00:20',
        );
        expect(result).toBe(10);
      });

      it('should handle negative duration', () => {
        const result = (service as any).calculateDuration(
          '00:00:20',
          '00:00:10',
        );
        expect(result).toBe(-10);
      });

      it('should handle zero duration', () => {
        const result = (service as any).calculateDuration(
          '00:00:10',
          '00:00:10',
        );
        expect(result).toBe(0);
      });
    });

    describe('timeToSeconds', () => {
      it('should convert numeric string to seconds', () => {
        const result = (service as any).timeToSeconds('120');
        expect(result).toBe(120);
      });

      it('should convert HH:MM:SS format to seconds', () => {
        const result = (service as any).timeToSeconds('01:02:03');
        expect(result).toBe(3723); // 1*3600 + 2*60 + 3
      });

      it('should convert MM:SS format to seconds', () => {
        const result = (service as any).timeToSeconds('02:30');
        expect(result).toBe(150); // 2*60 + 30
      });

      it('should handle zero time', () => {
        const result = (service as any).timeToSeconds('00:00:00');
        expect(result).toBe(0);
      });

      it('should handle large time values', () => {
        const result = (service as any).timeToSeconds('02:30:45');
        expect(result).toBe(9045); // 2*3600 + 30*60 + 45
      });

      it('should throw error for invalid format', () => {
        expect(() => (service as any).timeToSeconds('invalid')).toThrow(
          'Invalid time format: invalid',
        );
      });

      it('should throw error for single number format', () => {
        expect(() => (service as any).timeToSeconds('1')).toThrow(
          'Invalid time format: 1',
        );
      });

      it('should throw error for empty string', () => {
        expect(() => (service as any).timeToSeconds('')).toThrow(
          'Invalid time format: ',
        );
      });
    });
  });
});
