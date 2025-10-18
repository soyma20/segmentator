import { Types } from 'mongoose';
import { ProcessingStatus } from 'src/common/enums/processing-status.enum';
import { LlmProvider } from 'src/common/enums/llm-provider.enum';
import { VideoType } from 'src/common/enums/video-type.enum';

export interface ProcessingHistoryDocument {
  _id: Types.ObjectId;
  fileId: Types.ObjectId; // Посилання на файл
  processingStartedAt: Date; // Початок обробки
  processingCompletedAt?: Date; // Завершення обробки
  processingStatus: ProcessingStatus;
  // Конфігурація обробки
  configuration: {
    segmentDuration: number; // Тривалість сегмента в секундах
    llmProvider: LlmProvider;
    llmModel: string; // Конкретна модель (gpt-4o-mini, claude-3-haiku)
    analysisConfig: {
      videoType: VideoType;
      focusAreas: string[]; // Області акценту аналізу
      targetAudience: string; // Цільова аудиторія
      minInformativenessScore: number;
      maxCombinedDuration: number;
    };
  };
  // Результати виконання
  processing_metrics: {
    audioExtractionTime?: number; // Час вилучення аудіо (мс)
    transcriptionTime?: number; // Час транскрибування (мс)
    analysisTime?: number; // Час LLM аналізу (мс)
    totalTime?: number; // Загальний час обробки (мс)
    llmTokensUsed?: number; // Використані токени
    estimatedCost?: number; // Оціночна вартість в USD
  };
  errorDetails?: {
    stage: string; // Етап, на якому сталася помилка
    message: string; // Повідомлення про помилку
    stackTrace?: string; // Стек виклику для налагодження
  };
}
