import { Test, TestingModule } from '@nestjs/testing';
import { GoogleSpeechService } from './google-speech.service';

describe('GoogleSpeechService', () => {
  let service: GoogleSpeechService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GoogleSpeechService],
    }).compile();

    service = module.get<GoogleSpeechService>(GoogleSpeechService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
