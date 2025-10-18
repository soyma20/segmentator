export interface SegmentAnalysisRequest {
  segments: Array<{
    id: string;
    startTime: string;
    endTime: string;
    text: string;
    duration: number;
  }>;
  videoType: string;
  focusAreas: string[];
  targetAudience: string;
  analysisLanguage: string;
}

export interface SegmentAnalysisResponse {
  segments: Array<{
    segmentId: string;
    informativenessScore: number;
    keyTopics: string[];
    reasoning: string;
    shouldCombineWithNext: boolean;
    combinationReason?: string;
  }>;
  overallSummary?: string;
  mainTopics?: string[];
}

export interface ILlmProvider {
  analyzeSegments(
    request: SegmentAnalysisRequest,
  ): Promise<SegmentAnalysisResponse>;
}
