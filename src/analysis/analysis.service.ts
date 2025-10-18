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
      '9-10': number;
      '7-8': number;
      '4-6': number;
      '1-3': number;
    };
    optimizationMetrics: {
      segmentsReduction: number;
      reductionPercentage: number;
      averageDurationIncrease: number;
      combinedSegmentsCount: number;
      mergingEfficiency: number;
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

      // Calculate percentile ranks for all segments
      this.calculatePercentileRanks(analyzedSegments);

      // Step 4: Optimize segments (Stage 3 preparation)
      const optimizedSegments = this.optimizeSegments(
        analyzedSegments,
        configuration.analysisConfig,
      );

      // Step 5: Calculate metrics
      const metrics = this.calculateMetrics(
        analyzedSegments,
        optimizedSegments,
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
        percentileRank: 0, // Will be calculated after all segments are created
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

  /**
   * Calculates percentile ranks for all analyzed segments
   */
  private calculatePercentileRanks(analyzedSegments: AnalyzedSegment[]): void {
    const scores = analyzedSegments.map((s) => s.informativenessScore);

    analyzedSegments.forEach((segment) => {
      segment.percentileRank = this.calculatePercentile(
        segment.informativenessScore,
        scores,
      );
    });
  }

  private optimizeSegments(
    analyzedSegments: AnalyzedSegment[],
    analysisConfig: ProcessingHistory['configuration']['analysisConfig'],
  ): OptimizedSegment[] {
    this.logger.log('Starting Stage 3: Optimization and Result Formation');

    // Step 1: Optimize segments by merging adjacent ones
    const optimizedSegments = this.optimizeSegmentsByMerging(
      analyzedSegments,
      analysisConfig,
    );

    // Step 2: Rank and filter segments
    const rankedSegments = this.rankAndFilterSegments(
      optimizedSegments,
      analysisConfig.minInformativenessScore || 5,
    );

    this.logger.log(
      `Stage 3 completed. Optimized ${analyzedSegments.length} segments into ${rankedSegments.length} final segments`,
    );

    return rankedSegments;
  }

  /**
   * Implements the OptimizeSegments algorithm from the specification
   * Analyzes adjacent segments for potential merging based on criteria
   */
  private optimizeSegmentsByMerging(
    analyzedSegments: AnalyzedSegment[],
    analysisConfig: ProcessingHistory['configuration']['analysisConfig'],
  ): OptimizedSegment[] {
    this.logger.log(
      `Starting segment optimization with maxCombinedDuration: ${analysisConfig.maxCombinedDuration}s`,
    );

    const optimized: OptimizedSegment[] = [];
    let currentGroup: AnalyzedSegment[] = [];

    for (let i = 0; i < analyzedSegments.length; i++) {
      const segment = analyzedSegments[i];

      if (
        this.shouldCombine(
          segment,
          currentGroup,
          analysisConfig.maxCombinedDuration,
        )
      ) {
        currentGroup.push(segment);
        this.logger.log(
          `Added segment ${segment.segmentId} to group. Group size: ${currentGroup.length}`,
        );
      } else {
        // Process the current group if it's not empty
        if (currentGroup.length > 0) {
          const combined = this.combineSegments(currentGroup);
          optimized.push(combined);
          this.logger.log(
            `Created optimized segment with ${currentGroup.length} segments, duration: ${combined.duration}s`,
          );
        }
        // Start a new group with the current segment
        currentGroup = [segment];
        this.logger.log(`Started new group with segment ${segment.segmentId}`);
      }
    }

    // Process the last group if it exists
    if (currentGroup.length > 0) {
      const combined = this.combineSegments(currentGroup);
      optimized.push(combined);
      this.logger.log(
        `Created final optimized segment with ${currentGroup.length} segments, duration: ${combined.duration}s`,
      );
    }

    this.logger.log(
      `Optimization complete. Created ${optimized.length} optimized segments from ${analyzedSegments.length} analyzed segments`,
    );
    return optimized;
  }

  /**
   * Calculates the total duration of a group of segments
   */
  private calculateGroupDuration(segments: AnalyzedSegment[]): number {
    if (segments.length === 0) return 0;

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    return (
      this.timeToSeconds(lastSegment.endTime) -
      this.timeToSeconds(firstSegment.startTime)
    );
  }

  /**
   * Determines if a segment should be combined with the current group
   */
  private shouldCombine(
    segment: AnalyzedSegment,
    currentGroup: AnalyzedSegment[],
    maxCombinedDuration: number,
  ): boolean {
    if (currentGroup.length === 0) {
      return true; // Always start with the first segment
    }

    const lastSegment = currentGroup[currentGroup.length - 1];

    // Check duration limit first - this is the most important constraint
    const currentGroupDuration = this.calculateGroupDuration(currentGroup);
    const segmentStartTime = this.timeToSeconds(segment.startTime);
    const groupStartTime = this.timeToSeconds(currentGroup[0].startTime);
    const totalDuration = segmentStartTime - groupStartTime + segment.duration;

    if (totalDuration > maxCombinedDuration) {
      this.logger.log(
        `Not combining segment ${segment.segmentId}: would exceed max duration (${totalDuration}s > ${maxCombinedDuration}s)`,
      );
      return false;
    }

    // Check if the last segment in the group recommends combining with next
    if (lastSegment.shouldCombineWithNext) {
      return true;
    }

    // Additional criteria for combination:
    // 1. Similar informativeness scores (within 2 points)
    const scoreDifference = Math.abs(
      segment.informativenessScore - lastSegment.informativenessScore,
    );
    if (scoreDifference <= 2) {
      return true;
    }

    // 2. Overlapping key topics
    const hasOverlappingTopics = segment.keyTopics.some((topic) =>
      lastSegment.keyTopics.some(
        (lastTopic) =>
          topic.toLowerCase().includes(lastTopic.toLowerCase()) ||
          lastTopic.toLowerCase().includes(topic.toLowerCase()),
      ),
    );

    if (hasOverlappingTopics) {
      return true;
    }

    // 3. Both segments are high-value (score >= 7)
    if (
      segment.informativenessScore >= 7 &&
      lastSegment.informativenessScore >= 7
    ) {
      return true;
    }

    return false;
  }

  /**
   * Combines multiple segments into a single optimized segment
   */
  private combineSegments(segments: AnalyzedSegment[]): OptimizedSegment {
    if (segments.length === 1) {
      const segment = segments[0];
      return {
        _id: segment.segmentId,
        startTime: segment.startTime,
        endTime: segment.endTime,
        duration: segment.duration,
        combinedSegmentIds: [segment.segmentId],
        aggregatedScore: segment.informativenessScore,
        finalTitle: segment.title,
        finalSummary: segment.summary,
        finalKeyTopics: segment.keyTopics,
        extractionPriority: segment.informativenessScore,
        rank: 1, // Single segment gets rank 1
      };
    }

    // Sort segments by start time to ensure proper ordering
    const sortedSegments = [...segments].sort(
      (a, b) =>
        this.timeToSeconds(a.startTime) - this.timeToSeconds(b.startTime),
    );

    const firstSegment = sortedSegments[0];
    const lastSegment = sortedSegments[sortedSegments.length - 1];

    // Calculate aggregated metrics
    const scores = sortedSegments.map((s) => s.informativenessScore);
    const aggregatedScore = this.calculateAggregatedScore(scores);

    // Combine key topics (remove duplicates)
    const allTopics = sortedSegments.flatMap((s) => s.keyTopics);
    const uniqueTopics = [...new Set(allTopics)];

    // Create combined title and summary
    const combinedTitle = this.createCombinedTitle(sortedSegments);
    const combinedSummary = this.createCombinedSummary(sortedSegments);

    return {
      _id: firstSegment.segmentId, // Use first segment's ID as primary
      startTime: firstSegment.startTime,
      endTime: lastSegment.endTime,
      duration:
        this.timeToSeconds(lastSegment.endTime) -
        this.timeToSeconds(firstSegment.startTime),
      combinedSegmentIds: sortedSegments.map((s) => s.segmentId),
      aggregatedScore,
      finalTitle: combinedTitle,
      finalSummary: combinedSummary,
      finalKeyTopics: uniqueTopics,
      extractionPriority: aggregatedScore,
      rank: 1, // Will be updated during ranking phase
    };
  }

  /**
   * Calculates aggregated score for combined segments
   */
  private calculateAggregatedScore(scores: number[]): number {
    if (scores.length === 1) {
      return scores[0];
    }

    // Weighted average with higher scores having more weight
    const weights = scores.map((score) => Math.pow(score, 1.5));
    const weightedSum = scores.reduce(
      (sum, score, index) => sum + score * weights[index],
      0,
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    return Math.round((weightedSum / totalWeight) * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Creates a combined title from multiple segments
   */
  private createCombinedTitle(segments: AnalyzedSegment[]): string {
    if (segments.length === 1) {
      return segments[0].title;
    }

    // Take the title from the highest-scoring segment
    const highestScoringSegment = segments.reduce((prev, current) =>
      current.informativenessScore > prev.informativenessScore ? current : prev,
    );

    return `${highestScoringSegment.title} (Combined)`;
  }

  /**
   * Creates a combined summary from multiple segments
   */
  private createCombinedSummary(segments: AnalyzedSegment[]): string {
    if (segments.length === 1) {
      return segments[0].summary;
    }

    const summaries = segments
      .map((s) => s.summary)
      .filter((summary) => summary.trim());
    return summaries.join(' ') + ' (Combined segments)';
  }

  /**
   * Implements the RankAndFilterSegments algorithm from the specification
   */
  private rankAndFilterSegments(
    optimizedSegments: OptimizedSegment[],
    minScoreThreshold: number,
  ): OptimizedSegment[] {
    // Step 1: Filter segments by minimum score threshold
    const filtered = optimizedSegments.filter(
      (segment) => segment.aggregatedScore >= minScoreThreshold,
    );

    // Step 2: Sort by aggregated score (descending) and then by start time (ascending)
    const ranked = filtered.sort((a, b) => {
      if (b.aggregatedScore !== a.aggregatedScore) {
        return b.aggregatedScore - a.aggregatedScore;
      }
      return this.timeToSeconds(a.startTime) - this.timeToSeconds(b.startTime);
    });

    // Step 3: Add ranking and percentile information
    const allScores = optimizedSegments.map((s) => s.aggregatedScore);
    return ranked.map((segment, index) => ({
      ...segment,
      rank: index + 1, // Assign rank position as per algorithm specification
      extractionPriority: this.calculateExtractionPriorityWithRanking(
        segment,
        index + 1,
        allScores,
      ),
    }));
  }

  /**
   * Calculates extraction priority with ranking considerations
   */
  private calculateExtractionPriorityWithRanking(
    segment: OptimizedSegment,
    rank: number,
    allScores: number[],
  ): number {
    const percentile = this.calculatePercentile(
      segment.aggregatedScore,
      allScores,
    );

    // Base priority is the aggregated score
    let priority = segment.aggregatedScore;

    // Boost for top-ranked segments
    if (rank <= 3) {
      priority += 1;
    }

    // Boost for high percentile segments
    if (percentile >= 90) {
      priority += 0.5;
    }

    return Math.min(priority, 10); // Cap at 10
  }

  /**
   * Calculates percentile rank for a score
   */
  private calculatePercentile(score: number, allScores: number[]): number {
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const index = sortedScores.findIndex((s) => s >= score);

    if (index === -1) {
      return 100; // Score is higher than all others
    }

    return Math.round((index / sortedScores.length) * 100);
  }

  /**
   * Converts time string (HH:MM:SS) to seconds
   */
  private timeToSeconds(timeString: string): number {
    const parts = timeString.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
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
    optimizedSegments: OptimizedSegment[],
    analysisResponse: SegmentAnalysisResponse,
    processingTimeMs: number,
  ) {
    const scores = analyzedSegments.map((s) => s.informativenessScore);
    const averageScore =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const highValueSegments = scores.filter((score) => score >= 7).length;

    const scoreDistribution = {
      '9-10': scores.filter((s) => s >= 9).length,
      '7-8': scores.filter((s) => s >= 7 && s < 9).length,
      '4-6': scores.filter((s) => s >= 4 && s < 7).length,
      '1-3': scores.filter((s) => s < 4).length,
    };

    // Calculate optimization metrics
    const optimizationMetrics = this.calculateOptimizationMetrics(
      analyzedSegments,
      optimizedSegments,
    );

    return {
      totalSegmentsAnalyzed: analyzedSegments.length,
      highValueSegments,
      tokensUsed: 0, // TODO: Get from OpenAI response
      processingTimeMs,
      averageScore,
      scoreDistribution,
      ...optimizationMetrics,
    };
  }

  /**
   * Calculates Stage 3 optimization effectiveness metrics
   */
  private calculateOptimizationMetrics(
    analyzedSegments: AnalyzedSegment[],
    optimizedSegments: OptimizedSegment[],
  ) {
    const totalOriginalSegments = analyzedSegments.length;
    const totalOptimizedSegments = optimizedSegments.length;
    const segmentsReduction = totalOriginalSegments - totalOptimizedSegments;
    const reductionPercentage =
      totalOriginalSegments > 0
        ? (segmentsReduction / totalOriginalSegments) * 100
        : 0;

    // Calculate average duration change
    const originalAvgDuration =
      analyzedSegments.reduce((sum, s) => sum + s.duration, 0) /
      totalOriginalSegments;
    const optimizedAvgDuration =
      optimizedSegments.reduce((sum, s) => sum + s.duration, 0) /
      totalOptimizedSegments;
    const durationIncrease = optimizedAvgDuration - originalAvgDuration;

    // Count combined segments
    const combinedSegments = optimizedSegments.filter(
      (s) => s.combinedSegmentIds.length > 1,
    ).length;

    return {
      optimizationMetrics: {
        segmentsReduction,
        reductionPercentage: Math.round(reductionPercentage * 100) / 100,
        averageDurationIncrease: Math.round(durationIncrease * 100) / 100,
        combinedSegmentsCount: combinedSegments,
        mergingEfficiency:
          totalOptimizedSegments > 0
            ? Math.round(
                (combinedSegments / totalOptimizedSegments) * 100 * 100,
              ) / 100
            : 0,
      },
    };
  }
}
