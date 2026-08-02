import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { JobsService } from '../jobs/jobs.service';
import { VarganiService } from './vargani.service';

@Injectable()
export class JobDrainService {
  private readonly logger = new Logger(JobDrainService.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly varganiService: VarganiService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async drain() {
    const workerId = `api-${randomUUID()}`;
    const batchSize = this.config.get('JOB_DRAIN_BATCH_SIZE', { infer: true });
    let completed = 0;
    let failed = 0;

    for (let index = 0; index < batchSize; index += 1) {
      const job = await this.jobsService.claimNext(workerId);
      if (!job) break;
      try {
        if (job.type !== 'SEND_WHATSAPP_RECEIPT') throw new Error(`Unsupported job type: ${job.type}`);
        const payload = isRecord(job.payload) ? job.payload : {};
        await this.varganiService.processWhatsAppRetry(payload);
        await this.jobsService.complete(job.id);
        completed += 1;
      } catch (error) {
        await this.jobsService.fail(job.id, safeJobError(error));
        failed += 1;
        this.logger.warn(`Background job failed id=${job.id} type=${job.type}`);
      }
    }

    return { completed, failed, workerId };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeJobError(error: unknown) {
  if (!(error instanceof Error)) return 'Background job failed.';
  return `${error.name}: ${error.message}`.slice(0, 500);
}
