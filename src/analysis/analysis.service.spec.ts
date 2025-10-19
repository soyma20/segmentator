import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalysisService } from './analysis.service';
import { AnalyzedSegment } from './schemas/analyzed-segment.schema';
import { OptimizedSegment } from './schemas/optimized-segment.schema';
import { LlmService } from '../common/providers/llm/llm.service';

describe('AnalysisService', () => {
  let service: AnalysisService;
  let mockAnalysisResultModel: jest.Mocked<Model<any>>;
  let mockLlmService: jest.Mocked<LlmService>;

  // Helper function to create mock AnalyzedSegment
  const createMockAnalyzedSegment = (
    overrides: Partial<AnalyzedSegment> = {},
  ): AnalyzedSegment => ({
    segmentId: 'segment_1',
    startTime: '00:00:00',
    endTime: '00:00:30',
    duration: 30,
    informativenessScore: 7,
    percentileRank: 80,
    title: 'Test Segment',
    summary: 'Test summary',
    keyTopics: ['topic1'],
    reasoning: 'Test reasoning',
    recommendedForExtraction: true,
    shouldCombineWithNext: false,
    combinationReason: undefined,
    keywordDensity: 0.5,
    sentimentScore: 0.5,
    technicalComplexity: 0.3,
    ...overrides,
  });

  // Helper function to create mock analysis config
  const createMockAnalysisConfig = (overrides: any = {}) => ({
    videoType: 'educational',
    focusAreas: ['technical'],
    targetAudience: 'developers',
    analysisLanguage: 'en',
    maxCombinedDuration: 120,
    minScoreThreshold: 5,
    ...overrides,
  });

  beforeEach(async () => {
    const mockModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      exec: jest.fn(),
    };

    const mockLlmServiceInstance = {
      analyzeSegments: jest.fn(),
      getCurrentProvider: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: getModelToken('AnalysisResult'),
          useValue: mockModel,
        },
        {
          provide: LlmService,
          useValue: mockLlmServiceInstance,
        },
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
    mockAnalysisResultModel = module.get(getModelToken('AnalysisResult'));
    mockLlmService = module.get(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('optimizeSegmentsByMerging', () => {
    it('should merge adjacent segments with similar scores (score difference <= 2)', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 8, // Score difference = 1 (<= 2)
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_3',
          startTime: '00:01:00',
          endTime: '00:01:30',
          duration: 30,
          informativenessScore: 4, // Score difference = 4 (> 2)
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      // Access private method for testing
      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].combinedSegmentIds).toEqual([
        'segment_1',
        'segment_2',
        'segment_3',
      ]);
      expect(result[0].duration).toBe(90); // Combined duration
    });

    it('should respect the shouldCombineWithNext flag from LLM', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
          shouldCombineWithNext: true, // LLM recommends combining
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 3, // Large score difference but should still combine
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_3',
          startTime: '00:01:00',
          endTime: '00:01:30',
          duration: 30,
          informativenessScore: 8,
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].combinedSegmentIds).toEqual([
        'segment_1',
        'segment_2',
        'segment_3',
      ]);
      expect(result[0].duration).toBe(90);
    });

    it('should handle maxCombinedDuration constraint', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:01:00',
          duration: 60,
          informativenessScore: 7,
          shouldCombineWithNext: true,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:01:00',
          endTime: '00:02:00',
          duration: 60,
          informativenessScore: 8,
          shouldCombineWithNext: true,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_3',
          startTime: '00:02:00',
          endTime: '00:02:30',
          duration: 30,
          informativenessScore: 7,
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 90 }); // 90 seconds limit

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(2);
      // With 90 second limit, segments 1 and 2 cannot combine (60 + 60 = 120 > 90)
      // But segments 2 and 3 can combine (60 + 30 = 90 <= 90) due to shouldCombineWithNext flag
      expect(result[0].combinedSegmentIds).toEqual(['segment_1']);
      expect(result[0].duration).toBe(60);
      expect(result[1].combinedSegmentIds).toEqual(['segment_2', 'segment_3']);
      expect(result[1].duration).toBe(90);
    });

    it('should process segments with overlapping key topics', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 6,
          keyTopics: ['javascript', 'programming'],
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 5, // Score difference = 1 (<= 2)
          keyTopics: ['programming', 'web development'], // Overlapping topic: 'programming'
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_3',
          startTime: '00:01:00',
          endTime: '00:01:30',
          duration: 30,
          informativenessScore: 4,
          keyTopics: ['python', 'data science'], // No overlapping topics
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].combinedSegmentIds).toEqual([
        'segment_1',
        'segment_2',
        'segment_3',
      ]);
      expect(result[0].finalKeyTopics).toContain('javascript');
      expect(result[0].finalKeyTopics).toContain('programming');
      expect(result[0].finalKeyTopics).toContain('web development');
      expect(result[0].finalKeyTopics).toContain('python');
      expect(result[0].finalKeyTopics).toContain('data science');
    });

    it('should combine high-value segments (score >= 7) even with different topics', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 8, // High value
          keyTopics: ['machine learning'],
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 7, // High value
          keyTopics: ['artificial intelligence'], // Different topic
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_3',
          startTime: '00:01:00',
          endTime: '00:01:30',
          duration: 30,
          informativenessScore: 4, // Low value
          keyTopics: ['web development'],
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(2);
      expect(result[0].combinedSegmentIds).toEqual(['segment_1', 'segment_2']);
      expect(result[1].combinedSegmentIds).toEqual(['segment_3']);
    });

    it('should handle case-insensitive topic matching', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 6,
          keyTopics: ['JavaScript', 'PROGRAMMING'],
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 5,
          keyTopics: ['javascript', 'programming'], // Different case
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].combinedSegmentIds).toEqual(['segment_1', 'segment_2']);
    });

    it('should handle partial topic matching (substring inclusion)', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 6,
          keyTopics: ['web development'],
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 5,
          keyTopics: ['web'], // Substring of 'web development'
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].combinedSegmentIds).toEqual(['segment_1', 'segment_2']);
    });

    it('should not combine segments when no criteria are met', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 3,
          keyTopics: ['topic1'],
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 6, // Score difference = 3 (> 2)
          keyTopics: ['topic2'], // No overlapping topics
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(2);
      expect(result[0].combinedSegmentIds).toEqual(['segment_1']);
      expect(result[1].combinedSegmentIds).toEqual(['segment_2']);
    });

    it('should handle empty segments array', () => {
      const segments: AnalyzedSegment[] = [];
      const config = createMockAnalysisConfig();

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(0);
    });

    it('should handle single segment', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
        }),
      ];

      const config = createMockAnalysisConfig();

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].combinedSegmentIds).toEqual(['segment_1']);
      expect(result[0].duration).toBe(30);
    });

    it('should create proper aggregated scores for combined segments', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
          shouldCombineWithNext: true,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 8,
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig();

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(1);
      expect(result[0].aggregatedScore).toBeGreaterThan(7);
      expect(result[0].aggregatedScore).toBeLessThan(8);
      // Should be weighted average favoring higher scores
    });

    it('should handle complex merging scenario with multiple groups', () => {
      const segments: AnalyzedSegment[] = [
        // Group 1: Similar scores
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
          shouldCombineWithNext: false,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 8,
          shouldCombineWithNext: false,
        }),
        // Group 2: LLM recommendation
        createMockAnalyzedSegment({
          segmentId: 'segment_3',
          startTime: '00:01:00',
          endTime: '00:01:30',
          duration: 30,
          informativenessScore: 4,
          shouldCombineWithNext: true,
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_4',
          startTime: '00:01:30',
          endTime: '00:02:00',
          duration: 30,
          informativenessScore: 6,
          shouldCombineWithNext: false,
        }),
        // Group 3: Single segment
        createMockAnalyzedSegment({
          segmentId: 'segment_5',
          startTime: '00:02:00',
          endTime: '00:02:30',
          duration: 30,
          informativenessScore: 9,
          shouldCombineWithNext: false,
        }),
      ];

      const config = createMockAnalysisConfig({ maxCombinedDuration: 120 });

      const result = (service as any).optimizeSegmentsByMerging(
        segments,
        config,
      );

      expect(result).toHaveLength(2);
      expect(result[0].combinedSegmentIds).toEqual([
        'segment_1',
        'segment_2',
        'segment_3',
        'segment_4',
      ]);
      expect(result[0].duration).toBe(120);
      expect(result[1].combinedSegmentIds).toEqual(['segment_5']);
    });
  });

  describe('shouldCombine method', () => {
    it('should return true for first segment (empty group)', () => {
      const segment = createMockAnalyzedSegment();
      const currentGroup: AnalyzedSegment[] = [];
      const maxCombinedDuration = 120;

      const result = (service as any).shouldCombine(
        segment,
        currentGroup,
        maxCombinedDuration,
      );

      expect(result).toBe(true);
    });

    it('should return false when duration limit would be exceeded', () => {
      const segment = createMockAnalyzedSegment({
        segmentId: 'segment_2',
        startTime: '00:01:00',
        endTime: '00:01:30',
        duration: 30,
      });
      const currentGroup: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:01:00',
          duration: 60,
        }),
      ];
      const maxCombinedDuration = 80; // Would exceed with 60 + 30 = 90

      const result = (service as any).shouldCombine(
        segment,
        currentGroup,
        maxCombinedDuration,
      );

      expect(result).toBe(false);
    });

    it('should return true when last segment recommends combining', () => {
      const segment = createMockAnalyzedSegment({
        segmentId: 'segment_2',
        informativenessScore: 3, // Very different score
        keyTopics: ['different'], // Different topics
      });
      const currentGroup: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          shouldCombineWithNext: true, // Recommends combining
        }),
      ];
      const maxCombinedDuration = 120;

      const result = (service as any).shouldCombine(
        segment,
        currentGroup,
        maxCombinedDuration,
      );

      expect(result).toBe(true);
    });
  });

  describe('combineSegments method', () => {
    it('should handle single segment correctly', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
          title: 'Test Title',
          summary: 'Test Summary',
          keyTopics: ['topic1'],
        }),
      ];

      const result = (service as any).combineSegments(segments);

      expect(result).toEqual({
        _id: 'segment_1',
        startTime: '00:00:00',
        endTime: '00:00:30',
        duration: 30,
        combinedSegmentIds: ['segment_1'],
        aggregatedScore: 7,
        finalTitle: 'Test Title',
        finalSummary: 'Test Summary',
        finalKeyTopics: ['topic1'],
        extractionPriority: 7,
        rank: 1,
      });
    });

    it('should properly combine multiple segments', () => {
      const segments: AnalyzedSegment[] = [
        createMockAnalyzedSegment({
          segmentId: 'segment_1',
          startTime: '00:00:00',
          endTime: '00:00:30',
          duration: 30,
          informativenessScore: 7,
          title: 'First Title',
          summary: 'First summary',
          keyTopics: ['topic1', 'topic2'],
        }),
        createMockAnalyzedSegment({
          segmentId: 'segment_2',
          startTime: '00:00:30',
          endTime: '00:01:00',
          duration: 30,
          informativenessScore: 8,
          title: 'Second Title',
          summary: 'Second summary',
          keyTopics: ['topic2', 'topic3'],
        }),
      ];

      const result = (service as any).combineSegments(segments);

      expect(result._id).toBe('segment_1');
      expect(result.startTime).toBe('00:00:00');
      expect(result.endTime).toBe('00:01:00');
      expect(result.duration).toBe(60);
      expect(result.combinedSegmentIds).toEqual(['segment_1', 'segment_2']);
      expect(result.finalKeyTopics).toEqual(['topic1', 'topic2', 'topic3']); // Unique topics
      expect(result.finalTitle).toContain('Second Title'); // Highest scoring segment's title
      expect(result.finalSummary).toContain('First summary');
      expect(result.finalSummary).toContain('Second summary');
    });
  });

  describe('calculateAggregatedScore method', () => {
    it('should return the score for single segment', () => {
      const scores = [7];
      const result = (service as any).calculateAggregatedScore(scores);
      expect(result).toBe(7);
    });

    it('should calculate weighted average for multiple scores', () => {
      const scores = [7, 8, 9];
      const result = (service as any).calculateAggregatedScore(scores);

      // Should be weighted toward higher scores
      expect(result).toBeGreaterThan(8);
      expect(result).toBeLessThan(9);
      expect(result).toBeCloseTo(8.1, 1); // Approximate expected value
    });

    it('should round to 1 decimal place', () => {
      const scores = [7.1, 8.2];
      const result = (service as any).calculateAggregatedScore(scores);

      // Check that result has at most 1 decimal place
      expect(result.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(
        1,
      );
    });
  });

  describe('createCombinedTitle method', () => {
    it('should return original title for single segment', () => {
      const segments = [createMockAnalyzedSegment({ title: 'Original Title' })];
      const result = (service as any).createCombinedTitle(segments);
      expect(result).toBe('Original Title');
    });

    it('should use highest scoring segment title for multiple segments', () => {
      const segments = [
        createMockAnalyzedSegment({
          title: 'Lower Score Title',
          informativenessScore: 6,
        }),
        createMockAnalyzedSegment({
          title: 'Higher Score Title',
          informativenessScore: 8,
        }),
      ];
      const result = (service as any).createCombinedTitle(segments);
      expect(result).toBe('Higher Score Title (Combined)');
    });
  });

  describe('createCombinedSummary method', () => {
    it('should return original summary for single segment', () => {
      const segments = [
        createMockAnalyzedSegment({ summary: 'Original Summary' }),
      ];
      const result = (service as any).createCombinedSummary(segments);
      expect(result).toBe('Original Summary');
    });

    it('should combine summaries for multiple segments', () => {
      const segments = [
        createMockAnalyzedSegment({ summary: 'First summary' }),
        createMockAnalyzedSegment({ summary: 'Second summary' }),
      ];
      const result = (service as any).createCombinedSummary(segments);
      expect(result).toBe('First summary Second summary (Combined segments)');
    });

    it('should filter out empty summaries', () => {
      const segments = [
        createMockAnalyzedSegment({ summary: 'Valid summary' }),
        createMockAnalyzedSegment({ summary: '   ' }), // Empty summary
        createMockAnalyzedSegment({ summary: 'Another valid summary' }),
      ];
      const result = (service as any).createCombinedSummary(segments);
      expect(result).toBe(
        'Valid summary Another valid summary (Combined segments)',
      );
    });
  });

  describe('timeToSeconds method', () => {
    it('should convert HH:MM:SS format to seconds', () => {
      expect((service as any).timeToSeconds('01:30:45')).toBe(5445); // 1*3600 + 30*60 + 45
    });

    it('should convert MM:SS format to seconds', () => {
      expect((service as any).timeToSeconds('05:30')).toBe(330); // 5*60 + 30
    });

    it('should handle SS format', () => {
      expect((service as any).timeToSeconds('45')).toBe(45);
    });

    it('should handle edge cases', () => {
      expect((service as any).timeToSeconds('00:00:00')).toBe(0);
      expect((service as any).timeToSeconds('')).toBe(0);
    });
  });
});
