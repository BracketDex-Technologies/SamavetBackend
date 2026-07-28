import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
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
    type: VersioningType.URI,
    defaultVersion: '1',
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

  await app.listen(config.get('API_PORT', { infer: true }));
}

void bootstrap();
