import { Test } from '@nestjs/testing';

describe('AppModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      API_GLOBAL_PREFIX: 'api',
      CORS_ORIGINS: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-thirty-two-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-thirty-two-chars',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('compiles the complete API module graph', async () => {
    const { AppModule } = await import('./app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.close();
  });
});
