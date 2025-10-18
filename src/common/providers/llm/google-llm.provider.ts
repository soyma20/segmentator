import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILlmProvider,
  SegmentAnalysisRequest,
  SegmentAnalysisResponse,
} from '../../interfaces/llm.interface';

@Injectable()
export class GoogleLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(GoogleLlmProvider.name);

  constructor(private readonly configService: ConfigService) {
    // Only validate API key if this provider is actually being used
    const currentProvider = this.configService.get<string>(
      'LLM_PROVIDER',
      'openai',
    );
    if (currentProvider === 'google') {
      const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY is required');
      }
    }
  }

  async analyzeSegments(
    request: SegmentAnalysisRequest,
  ): Promise<SegmentAnalysisResponse> {
    // TODO: Implement Google Gemini integration
    // This is a placeholder implementation
    this.logger.log('Google LLM provider not implemented yet');
    throw new Error('Google LLM provider not implemented yet');
  }
}
