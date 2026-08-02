import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { JobDrainService } from './job-drain.service';

@Controller('internal/jobs')
export class JobDrainController {
  constructor(
    private readonly jobDrainService: JobDrainService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('drain')
  drain(@Headers('authorization') authorization?: string) {
    const secret = this.config.get('CRON_SECRET', { infer: true });
    const supplied = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!secret || !constantTimeEqual(secret, supplied)) {
      throw new UnauthorizedException('Invalid job runner credentials.');
    }
    return this.jobDrainService.drain();
  }
}

function constantTimeEqual(expected: string, supplied: string) {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
