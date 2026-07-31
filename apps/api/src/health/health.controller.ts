import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app-config';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process liveness check without external dependencies.' })
  getLiveness() {
    return {
      status: 'ok',
      service: 'digital-mandal-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Readiness check including database connectivity.' })
  async getReadiness() {
    const result = await this.checkDatabase();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
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

  private async checkDatabase() {
    const timeoutMs = this.config.get('HEALTH_DB_TIMEOUT_MS', { infer: true });
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Database health check timed out after ${timeoutMs}ms.`)), timeoutMs)),
      ]);

      return {
        status: 'ok',
        database: 'ok',
        service: 'digital-mandal-api',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'degraded',
        database: 'error',
        detail: error instanceof Error ? error.message : 'Unknown database error',
        service: 'digital-mandal-api',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
