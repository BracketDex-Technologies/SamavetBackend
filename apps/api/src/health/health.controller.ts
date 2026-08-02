import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app-config';

const startedAt = new Date();

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process liveness check without external dependencies.' })
  getLiveness() {
    return this.livenessPayload();
  }

  @Get('live')
  @Version(VERSION_NEUTRAL)
  @ApiOkResponse({ description: 'Process liveness check without external dependencies.' })
  getNeutralLiveness() {
    return this.livenessPayload();
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Readiness check including database connectivity.' })
  async getReadiness() {
    const result = await this.checkDatabase();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }

  @Get('ready')
  @Version(VERSION_NEUTRAL)
  @ApiOkResponse({ description: 'Readiness check including database connectivity.' })
  async getNeutralReadiness() {
    return this.getReadiness();
  }

  @Get()
  @ApiOkResponse({
    description: 'API and database health status.',
  })
  async getHealth() {
    const result = await this.checkDatabase();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }

  @Get()
  @Version(VERSION_NEUTRAL)
  @ApiOkResponse({
    description: 'API and database health status.',
  })
  async getNeutralHealth() {
    return this.getHealth();
  }

  private livenessPayload() {
    return {
      coldStart: process.uptime() < 60,
      nodeEnv: this.config.get('NODE_ENV', { infer: true }),
      pid: process.pid,
      service: 'digital-mandal-api',
      startedAt: startedAt.toISOString(),
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async checkDatabase() {
    const timeoutMs = this.config.get('HEALTH_DB_TIMEOUT_MS', { infer: true });
    const started = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Database health check timed out after ${timeoutMs}ms.`)), timeoutMs)),
      ]);
      const databaseLatencyMs = Date.now() - started;

      return {
        ...this.livenessPayload(),
        database: 'ok',
        databaseLatencyMs,
        status: 'ok',
      };
    } catch (error) {
      return {
        ...this.livenessPayload(),
        database: 'error',
        databaseLatencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Unknown database error',
        status: 'degraded',
      };
    }
  }
}
