import { Test, TestingModule } from '@nestjs/testing';
import { ProcessingController } from './processing.controller';

describe('ProcessingController', () => {
  let controller: ProcessingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessingController],
    }).compile();

    controller = module.get<ProcessingController>(ProcessingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
