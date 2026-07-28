import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../src/config/app-config';

let cachedServer: express.Express | undefined;

async function bootstrapServer(): Promise<express.Express> {
  if (cachedServer) {
    return cachedServer;
  }

  const appModulePath = '../dist/app.module.js';
  const { AppModule } = await import(appModulePath);
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    abortOnError: false,
    bufferLogs: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const globalPrefix = config.get('API_GLOBAL_PREFIX', { infer: true });
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });

  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ method: RequestMethod.GET, path: '/' }],
  });
  app.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  });
  app.use(helmet());
  app.use(compression());
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Digital Mandal API')
    .setDescription('Production API for Digital Mandal and Digital Vargani.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  await app.init();
  cachedServer = server;
  return server;
}

export default async function handler(
  request: express.Request,
  response: express.Response,
): Promise<void> {
  if (request.url === '/' || request.url?.startsWith('/favicon.')) {
    response.status(200).json({
      status: 'ok',
      service: 'digital-mandal-api',
      docs: '/api/docs',
      health: '/api/v1/health',
    });
    return;
  }

  try {
    const server = await bootstrapServer();
    server(request, response);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      detail: error instanceof Error ? error.message : 'Unknown bootstrap error',
      message: 'Digital Mandal API could not start. Check Vercel environment variables and logs.',
    });
  }
}
