import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../../enums/llm-provider.enum';
import type {
  ILlmProvider,
  SegmentAnalysisRequest,
  SegmentAnalysisResponse,
} from '../../interfaces/llm.interface';

@Injectable()
export class LlmService {
  constructor(
    @Inject('LLM_PROVIDER') private readonly llmProvider: ILlmProvider,
    private readonly configService: ConfigService,
  ) {}

  async analyzeSegments(
    request: SegmentAnalysisRequest,
  ): Promise<SegmentAnalysisResponse> {
    return this.llmProvider.analyzeSegments(request);
  }

  getCurrentProvider(): string {
    return this.configService.get<string>('LLM_PROVIDER', 'openai');
  }
}
