import { Test, TestingModule } from '@nestjs/testing';
import { TranscriptionController } from './transcription.controller';

describe('TranscriptionController', () => {
  let controller: TranscriptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscriptionController],
    }).compile();

    controller = module.get<TranscriptionController>(TranscriptionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
