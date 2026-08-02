import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { configureHttpApp } from '../src/common/bootstrap/configure-http-app';

let serverPromise: Promise<express.Express> | undefined;

async function bootstrapServer(): Promise<express.Express> {
  const appModulePath = '../dist/app.module.js';
  const { AppModule } = await import(appModulePath);
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    abortOnError: false,
    bodyParser: false,
    bufferLogs: true,
  });

  configureHttpApp(app);

  await app.init();
  return server;
}

function getServer() {
  if (!serverPromise) {
    serverPromise = bootstrapServer().catch((error: unknown) => {
      serverPromise = undefined;
      throw error;
    });
  }
  return serverPromise;
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
    const server = await getServer();
    server(request, response);
  } catch (error) {
    console.error({ error: error instanceof Error ? error.name : 'UnknownError', event: 'api_bootstrap_failed' });
    response.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      message: 'Digital Mandal API could not start. Check Vercel environment variables and logs.',
    });
  }
}
