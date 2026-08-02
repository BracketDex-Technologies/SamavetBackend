import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';
import { JobsService } from '../jobs/jobs.service';
import { JobDrainService } from './job-drain.service';
import { VarganiService } from './vargani.service';

function createService(jobs: Array<Record<string, unknown>>) {
  const queue = [...jobs];
  const jobsService = {
    claimNext: jest.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? null)),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  } as unknown as JobsService;
  const varganiService = {
    processWhatsAppRetry: jest.fn().mockResolvedValue({ status: 'sent' }),
  } as unknown as VarganiService;
  const config = {
    get: jest.fn(() => 10),
  } as unknown as ConfigService<AppConfig, true>;
  return {
    jobsService,
    service: new JobDrainService(jobsService, varganiService, config),
    varganiService,
  };
}

describe('JobDrainService', () => {
  it('claims, processes, and completes supported jobs', async () => {
    const { jobsService, service, varganiService } = createService([
      { id: 'job-1', payload: { receiptUrl: 'https://example.com/r', slipId: 'slip-1' }, type: 'SEND_WHATSAPP_RECEIPT' },
    ]);

    await expect(service.drain()).resolves.toMatchObject({ completed: 1, failed: 0 });
    expect(varganiService.processWhatsAppRetry).toHaveBeenCalledTimes(1);
    expect(jobsService.complete).toHaveBeenCalledWith('job-1');
  });

  it('fails unsupported jobs without stopping the batch', async () => {
    const { jobsService, service } = createService([{ id: 'job-2', payload: {}, type: 'UNKNOWN' }]);

    await expect(service.drain()).resolves.toMatchObject({ completed: 0, failed: 1 });
    expect(jobsService.fail).toHaveBeenCalledWith('job-2', expect.stringContaining('Unsupported job type'));
  });
});
