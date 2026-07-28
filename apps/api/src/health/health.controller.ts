import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({
    description: 'API and database health status.',
  })
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

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
