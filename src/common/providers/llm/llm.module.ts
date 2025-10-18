import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OpenaiLlmProvider } from './openai-llm.provider';
import { AnthropicLlmProvider } from './anthropic-llm.provider';
import { GoogleLlmProvider } from './google-llm.provider';
import { LlmService } from './llm.service';

@Module({
  imports: [ConfigModule],
  providers: [
    OpenaiLlmProvider,
    AnthropicLlmProvider,
    GoogleLlmProvider,
    {
      provide: 'LLM_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('LLM_PROVIDER', 'openai');

        switch (provider) {
          case 'anthropic':
            return new AnthropicLlmProvider(configService);
          case 'google':
            return new GoogleLlmProvider(configService);
          case 'openai':
          default:
            return new OpenaiLlmProvider(configService);
        }
      },
      inject: [ConfigService],
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
