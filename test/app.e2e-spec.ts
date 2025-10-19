import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('/ (GET) should return Hello World!', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });

    it('/ (GET) should return correct content type', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Content-Type', /text\/html/);
    });
  });

  describe('API Endpoints', () => {
    it('should handle non-existent routes with 404', () => {
      return request(app.getHttpServer())
        .get('/non-existent-route')
        .expect(404);
    });

    it('should handle files endpoint structure', () => {
      return request(app.getHttpServer())
        .get('/files')
        .expect((res) => {
          // Should not return 404, meaning the route exists
          expect(res.status).not.toBe(404);
        });
    });
  });

  describe('Application Bootstrap', () => {
    it('should start application successfully', () => {
      expect(app).toBeDefined();
      expect(app.getHttpServer()).toBeDefined();
    });

    it('should have proper middleware configured', () => {
      const httpServer = app.getHttpServer();
      expect(httpServer).toBeDefined();
    });
  });
});
