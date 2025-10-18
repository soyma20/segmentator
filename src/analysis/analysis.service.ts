import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Transcription } from '../transcription/schemas/transcription.schema';
import { TranscriptionSegment } from '../transcription/schemas/transcription-segment.schema';
import { ProcessingHistory } from '../processing/schemas/processing-history.schema';
import { AnalysisResult } from './schemas/analysis.schema';
import { AnalyzedSegment } from './schemas/analyzed-segment.schema';
import { OptimizedSegment } from './schemas/optimized-segment.schema';
import {
  OpenaiService,
  SegmentAnalysisRequest,
  SegmentAnalysisResponse,
} from '../external-apis/openai/openai.service';
import { getErrorMessage } from '../common/utils/error.utils';

type SegmentForAnalysis = {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
  duration: number;
};

export interface AnalysisResultData {
  analyzedSegments: AnalyzedSegment[];
  optimizedSegments: OptimizedSegment[];
  overallSummary: string;
  mainTopics: string[];
  metrics: {
    totalSegmentsAnalyzed: number;
    highValueSegments: number;
    tokensUsed: number;
    processingTimeMs: number;
    averageScore: number;
    scoreDistribution: {
      excellent: number; // 9-10
      good: number; // 7-8
      average: number; // 5-6
      poor: number; // 1-4
    };
  };
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly MAX_TOKENS_PER_REQUEST = 3000; // Conservative limit for gpt-4o-mini

  constructor(
    @InjectModel(AnalysisResult.name)
    private analysisResultModel: Model<AnalysisResult>,
    private readonly openaiService: OpenaiService,
  ) {}

  async analyzeSegments(
    transcription: Transcription,
    configuration: ProcessingHistory['configuration'],
  ): Promise<AnalysisResultData> {
    const startTime = Date.now();
    this.logger.log(
      `Starting segment analysis for ${transcription.segments.length} segments`,
    );

    try {
      // Step 1: Prepare segments for analysis
      const segmentsForAnalysis = this.prepareSegmentsForAnalysis(
        transcription.segments,
      );

      // Step 2: Batch process segments if needed
      const analysisResponse = await this.batchAnalyzeSegments(
        segmentsForAnalysis,
        configuration,
      );

      // Step 3: Create analyzed segments
      const analyzedSegments = this.createAnalyzedSegments(
        transcription.segments,
        analysisResponse.segments,
      );

      // Step 4: Optimize segments (Stage 3 preparation)
      const optimizedSegments = this.optimizeSegments(
        analyzedSegments,
        configuration.analysisConfig,
      );

      // Step 5: Calculate metrics
      const metrics = this.calculateMetrics(
        analyzedSegments,
        analysisResponse,
        Date.now() - startTime,
      );

      this.logger.log(
        `Analysis completed. Processed ${analyzedSegments.length} segments in ${metrics.processingTimeMs}ms`,
      );

      return {
        analyzedSegments,
        optimizedSegments,
        overallSummary: analysisResponse.overallSummary,
        mainTopics: analysisResponse.mainTopics,
        metrics,
      };
    } catch (error) {
      this.logger.error('Failed to analyze segments', getErrorMessage(error));
      throw error;
    }
  }

  private prepareSegmentsForAnalysis(segments: TranscriptionSegment[]) {
    return segments.map((segment, index) => ({
      id: segment._id || `segment_${index}`,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text: segment.text,
      duration: segment.duration,
    }));
  }

  private async batchAnalyzeSegments(
    segments: SegmentForAnalysis[],
    configuration: ProcessingHistory['configuration'],
  ): Promise<SegmentAnalysisResponse> {
    // Estimate tokens for the full request
    const fullPrompt = this.buildContextPrompt(configuration, segments);
    const estimatedTokens = this.openaiService.estimateTokens(fullPrompt);

    if (estimatedTokens <= this.MAX_TOKENS_PER_REQUEST) {
      // Process all segments in one batch
      return this.processSegmentsBatch(segments, configuration);
    } else {
      // Split into smaller batches
      return this.processSegmentsInBatches(segments, configuration);
    }
  }

  private async processSegmentsBatch(
    segments: SegmentForAnalysis[],
    configuration: ProcessingHistory['configuration'],
  ): Promise<SegmentAnalysisResponse> {
    const request: SegmentAnalysisRequest = {
      segments,
      videoType: configuration.analysisConfig.videoType,
      focusAreas: configuration.analysisConfig.focusAreas,
      targetAudience: configuration.analysisConfig.targetAudience,
      analysisLanguage: 'en', // TODO: Get from configuration
    };

    return await this.openaiService.analyzeSegments(request);
  }

  private async processSegmentsInBatches(
    segments: SegmentForAnalysis[],
    configuration: ProcessingHistory['configuration'],
  ): Promise<SegmentAnalysisResponse> {
    const batchSize = Math.max(1, Math.floor(segments.length / 3)); // Split into ~3 batches
    const batches: SegmentForAnalysis[][] = [];

    for (let i = 0; i < segments.length; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    const batchResults: SegmentAnalysisResponse[] = [];

    for (const batch of batches) {
      const batchResult = await this.processSegmentsBatch(batch, configuration);
      batchResults.push(batchResult);
    }

    // Merge batch results
    return this.mergeBatchResults(batchResults);
  }

  private mergeBatchResults(
    results: SegmentAnalysisResponse[],
  ): SegmentAnalysisResponse {
    const mergedSegments = results.flatMap((result) => result.segments);
    const allMainTopics = results.flatMap((result) => result.mainTopics);
    const uniqueMainTopics = [...new Set(allMainTopics)];

    return {
      segments: mergedSegments,
      overallSummary: results.map((r) => r.overallSummary).join(' '),
      mainTopics: uniqueMainTopics,
    };
  }

  private buildContextPrompt(
    configuration: ProcessingHistory['configuration'],
    segments: SegmentForAnalysis[],
  ): string {
    const segmentsText = segments
      .map((segment, index) => {
        return `Segment ${index + 1} (${segment.startTime} - ${segment.endTime}):
ID: ${segment.id}
Duration: ${segment.duration}s
Text: "${segment.text}"`;
      })
      .join('\n\n');

    return `VIDEO CONTEXT: ${configuration.analysisConfig.videoType}
ANALYSIS FOCUS: ${configuration.analysisConfig.focusAreas.join(', ')}
TARGET AUDIENCE: ${configuration.analysisConfig.targetAudience}

SEGMENTS FOR ANALYSIS:
${segmentsText}`;
  }

  private createAnalyzedSegments(
    originalSegments: TranscriptionSegment[],
    analysisResults: SegmentAnalysisResponse['segments'],
  ): AnalyzedSegment[] {
    return originalSegments.map((segment, index) => {
      const analysis =
        analysisResults.find((a) => a.segmentId === segment._id) ||
        analysisResults[index] ||
        this.createDefaultAnalysis(segment);

      return {
        segmentId: segment._id,
        startTime: segment.startTime,
        endTime: segment.endTime,
        duration: segment.duration,
        informativenessScore: analysis.informativenessScore,
        percentileRank: 0, // Will be calculated later
        title: this.generateSegmentTitle(segment.text),
        summary: this.generateSegmentSummary(segment.text),
        keyTopics: analysis.keyTopics,
        reasoning: analysis.reasoning,
        recommendedForExtraction: analysis.informativenessScore >= 7,
        shouldCombineWithNext: analysis.shouldCombineWithNext,
        combinationReason: analysis.combinationReason,
        keywordDensity: this.calculateKeywordDensity(segment.text),
        sentimentScore: 0, // TODO: Implement sentiment analysis
        technicalComplexity: 0, // TODO: Implement complexity analysis
      };
    });
  }

  private createDefaultAnalysis(segment: TranscriptionSegment) {
    return {
      segmentId: segment._id,
      informativenessScore: 5,
      keyTopics: ['general'],
      reasoning: 'Default analysis - no specific analysis available',
      shouldCombineWithNext: false,
    };
  }

  private generateSegmentTitle(text: string): string {
    const words = text.split(' ').slice(0, 8);
    return words.join(' ') + (text.split(' ').length > 8 ? '...' : '');
  }

  private generateSegmentSummary(text: string): string {
    const sentences = text.split('.').slice(0, 2);
    return sentences.join('.') + (text.split('.').length > 2 ? '...' : '');
  }

  private calculateKeywordDensity(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    const wordCount = words.length;
    const uniqueWords = new Set(words).size;
    return wordCount > 0 ? uniqueWords / wordCount : 0;
  }

  private optimizeSegments(
    analyzedSegments: AnalyzedSegment[],
    analysisConfig: ProcessingHistory['configuration']['analysisConfig'],
  ): OptimizedSegment[] {
    // This is a simplified version of Stage 3 optimization
    // Full implementation would include merging logic
    return analyzedSegments.map((segment) => ({
      _id: segment.segmentId,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.duration,
      combinedSegmentIds: [segment.segmentId],
      aggregatedScore: segment.informativenessScore,
      finalTitle: segment.title,
      finalSummary: segment.summary,
      finalKeyTopics: segment.keyTopics,
      extractionPriority: this.calculateExtractionPriority(
        segment,
        analysisConfig,
      ),
    }));
  }

  private calculateExtractionPriority(
    segment: AnalyzedSegment,
    analysisConfig: ProcessingHistory['configuration']['analysisConfig'],
  ): number {
    let priority = segment.informativenessScore;

    // Boost priority for segments matching focus areas
    const focusAreaMatch = segment.keyTopics.some((topic) =>
      analysisConfig.focusAreas.some((focus) =>
        topic.toLowerCase().includes(focus.toLowerCase()),
      ),
    );

    if (focusAreaMatch) {
      priority += 1;
    }

    return Math.min(priority, 10);
  }

  private calculateMetrics(
    analyzedSegments: AnalyzedSegment[],
    analysisResponse: SegmentAnalysisResponse,
    processingTimeMs: number,
  ) {
    const scores = analyzedSegments.map((s) => s.informativenessScore);
    const averageScore =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const highValueSegments = scores.filter((score) => score >= 7).length;

    const scoreDistribution = {
      excellent: scores.filter((s) => s >= 9).length,
      good: scores.filter((s) => s >= 7 && s < 9).length,
      average: scores.filter((s) => s >= 5 && s < 7).length,
      poor: scores.filter((s) => s < 5).length,
    };

    return {
      totalSegmentsAnalyzed: analyzedSegments.length,
      highValueSegments,
      tokensUsed: 0, // TODO: Get from OpenAI response
      processingTimeMs,
      averageScore,
      scoreDistribution,
    };
  }
}
