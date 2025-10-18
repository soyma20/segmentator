import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILlmProvider,
  SegmentAnalysisRequest,
  SegmentAnalysisResponse,
} from '../../interfaces/llm.interface';

@Injectable()
export class AnthropicLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(AnthropicLlmProvider.name);

  constructor(private readonly configService: ConfigService) {
    // Only validate API key if this provider is actually being used
    const currentProvider = this.configService.get<string>(
      'LLM_PROVIDER',
      'openai',
    );
    if (currentProvider === 'anthropic') {
      const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required');
      }
    }
  }

  async analyzeSegments(
    request: SegmentAnalysisRequest,
  ): Promise<SegmentAnalysisResponse> {
    // TODO: Implement Anthropic Claude integration
    // This is a placeholder implementation
    this.logger.log('Anthropic LLM provider not implemented yet');
    throw new Error('Anthropic LLM provider not implemented yet');
  }
}
