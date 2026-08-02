import { NestFactory } from '@nestjs/core';
import type { Server } from 'http';
import { AppModule } from './app.module';
import { configureHttpApp } from './common/bootstrap/configure-http-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    bodyParser: false,
    bufferLogs: true,
  });

  const config = configureHttpApp(app);
  const requestTimeoutMs = config.get('REQUEST_TIMEOUT_MS', { infer: true });
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true }) ?? config.get('API_PORT', { infer: true }) ?? 4000;
  await app.listen(port, '0.0.0.0');
  const server = app.getHttpServer() as Server;
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(requestTimeoutMs + 5_000, 125_000);
  server.keepAliveTimeout = 65_000;
}

void bootstrap();
