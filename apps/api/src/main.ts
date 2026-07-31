import { Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    bodyParser: false,
    bufferLogs: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const globalPrefix = config.get('API_GLOBAL_PREFIX', { infer: true });
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  const requestTimeoutMs = config.get('REQUEST_TIMEOUT_MS', { infer: true });
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.disable('x-powered-by');
  httpAdapter.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));

  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ method: RequestMethod.GET, path: '/' }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(compression());
  app.use(json({ limit: config.get('BODY_LIMIT', { infer: true }) }));
  app.use(urlencoded({ extended: true, limit: config.get('BODY_LIMIT', { infer: true }) }));
  const requestLogger = new Logger('HTTP');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const suppliedId = request.header('x-request-id');
    const requestId = suppliedId && /^[a-zA-Z0-9._-]{1,100}$/.test(suppliedId) ? suppliedId : randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      if (response.statusCode >= 500 || durationMs >= 2_000) {
        requestLogger.warn(JSON.stringify({
          durationMs,
          method: request.method,
          path: request.originalUrl,
          requestId,
          statusCode: response.statusCode,
        }));
      }
    });
    next();
  });
  app.enableCors({
    credentials: true,
    origin: corsOrigins,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Digital Mandal API')
      .setDescription('Production API for Digital Mandal and Digital Vargani.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${globalPrefix}/docs`, app, document);
  }

  const port = config.get('PORT', { infer: true }) ?? config.get('API_PORT', { infer: true }) ?? 4000;
  await app.listen(port, '0.0.0.0');
  const server = app.getHttpServer() as Server;
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(requestTimeoutMs + 5_000, 125_000);
  server.keepAliveTimeout = 65_000;
}

void bootstrap();
