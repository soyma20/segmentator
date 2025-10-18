import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ILlmProvider,
  SegmentAnalysisRequest,
  SegmentAnalysisResponse,
} from '../../interfaces/llm.interface';

@Injectable()
export class OpenaiLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenaiLlmProvider.name);
  private readonly openai: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    // Only validate API key if this provider is actually being used
    const currentProvider = this.configService.get<string>(
      'LLM_PROVIDER',
      'openai',
    );
    if (currentProvider === 'openai') {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required');
      }

      (this as any).openai = new OpenAI({
        apiKey,
      });
    }
  }

  async analyzeSegments(
    request: SegmentAnalysisRequest,
  ): Promise<SegmentAnalysisResponse> {
    if (!this.openai) {
      throw new Error('OpenAI provider not properly initialized');
    }

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
      .map(
        (segment) =>
          `Segment ${segment.id} (${segment.startTime}-${segment.endTime}): ${segment.text}`,
      )
      .join('\n');

    return `
Analyze the following video segments for their informational value and content quality.

Video Type: ${request.videoType}
Focus Areas: ${request.focusAreas.join(', ')}
Target Audience: ${request.targetAudience}
Analysis Language: ${request.analysisLanguage}

Segments:
${segmentsText}

For each segment, provide:
1. Informativeness Score (0-10): How valuable is this content for the target audience?
2. Key Topics: Main topics covered in this segment
3. Reasoning: Brief explanation of the score
4. Should Combine With Next: Whether this segment should be combined with the next one
5. Combination Reason: If combining, explain why

Respond with a JSON object containing an array of segment analyses.
    `.trim();
  }
}
