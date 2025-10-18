import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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
  overallSummary: string;
  mainTopics: string[];
}

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  async analyzeSegments(
    request: SegmentAnalysisRequest,
  ): Promise<SegmentAnalysisResponse> {
    this.logger.log(
      `Starting segment analysis for ${request.segments.length} segments`,
    );

    const prompt = this.buildAnalysisPrompt(request);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert content analyst specializing in video content evaluation. You analyze segments based on their informational value and provide structured JSON responses.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const parsedResponse = JSON.parse(content) as SegmentAnalysisResponse;

      this.logger.log(
        `Analysis completed. Tokens used: ${response.usage?.total_tokens || 'unknown'}`,
      );

      return parsedResponse;
    } catch (error) {
      this.logger.error('Failed to analyze segments with OpenAI', error);
      throw new Error(
        `OpenAI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private buildAnalysisPrompt(request: SegmentAnalysisRequest): string {
    const segmentsText = request.segments
      .map((segment, index) => {
        return `Segment ${index + 1} (${segment.startTime} - ${segment.endTime}):
ID: ${segment.id}
Duration: ${segment.duration}s
Text: "${segment.text}"`;
      })
      .join('\n\n');

    return `You are an expert in content analysis. Evaluate the provided video segments based on their informational value.

VIDEO CONTEXT: ${request.videoType}
ANALYSIS FOCUS: ${request.focusAreas.join(', ')}
TARGET AUDIENCE: ${request.targetAudience}
ANALYSIS LANGUAGE: ${request.analysisLanguage}

SEGMENTS FOR ANALYSIS:
${segmentsText}

FOR EACH SEGMENT PROVIDE:
1. Informativeness score (1-10, where 10 is the highest)
2. Key topics (2-3 main ones)
3. Reason for score (brief justification)
4. Recommendation to merge with adjacent segments (yes/no)
5. Combination reason (if recommended to merge)

ALSO PROVIDE:
- Overall summary of the content
- Main topics across all segments

RESPONSE FORMAT: Return a JSON object with this exact structure:
{
  "segments": [
    {
      "segmentId": "segment_id",
      "informativenessScore": 8,
      "keyTopics": ["topic1", "topic2"],
      "reasoning": "Brief explanation of the score",
      "shouldCombineWithNext": false,
      "combinationReason": "Optional reason for combination"
    }
  ],
  "overallSummary": "Overall summary of the content",
  "mainTopics": ["main_topic1", "main_topic2", "main_topic3"]
}`;
  }

  estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}
