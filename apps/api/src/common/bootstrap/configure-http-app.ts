import { INestApplication, Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../config/app-config';
import { AllExceptionsFilter } from '../http/all-exceptions.filter';

export function configureHttpApp(app: INestApplication) {
  const config = app.get(ConfigService<AppConfig, true>);
  const globalPrefix = config.get('API_GLOBAL_PREFIX', { infer: true });
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.disable('x-powered-by');
  httpAdapter.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));

  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ method: RequestMethod.GET, path: '/' }],
  });
  app.enableVersioning({ defaultVersion: '1', type: VersioningType.URI });
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
    response.setHeader('cache-control', 'no-store');
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

  app.enableCors({ credentials: true, origin: config.get('CORS_ORIGINS', { infer: true }) });
  app.useGlobalPipes(new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  }));
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Digital Mandal API')
      .setDescription('Production API for Digital Mandal and Digital Vargani.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${globalPrefix}/docs`, app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  return config;
}
