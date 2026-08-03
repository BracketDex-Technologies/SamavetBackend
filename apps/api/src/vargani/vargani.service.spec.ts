import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VarganiService } from './vargani.service';
import { WhatsAppReceiptService } from './whatsapp-receipt.service';

describe('VarganiService deleteSlip', () => {
  it('permanently deletes the tenant slip and records the deletion atomically', async () => {
    const slip = {
      collectedByUserId: '11111111-1111-1111-1111-111111111111',
      contributorName: 'Test contributor',
      id: '33333333-3333-3333-3333-333333333333',
      mandalId: '22222222-2222-2222-2222-222222222222',
      slipNumber: 'DM-TEST-000001',
    };
    const transactionClient = {
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
      varganiSlip: { delete: jest.fn().mockResolvedValue(slip) },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof transactionClient) => Promise<unknown>) => operation(transactionClient)),
      varganiSlip: { findFirst: jest.fn().mockResolvedValue(slip) },
    } as unknown as PrismaService;
    const service = new VarganiService(
      prisma,
      {} as ConfigService<AppConfig, true>,
      {} as WhatsAppReceiptService,
      {} as StorageService,
      {} as JobsService,
    );

    await expect(service.deleteSlip({
      mandalId: slip.mandalId,
      role: UserRole.MANDAL_ADMIN,
      userId: slip.collectedByUserId,
    }, slip.id)).resolves.toEqual({ deleted: true, id: slip.id });

    expect(transactionClient.varganiSlip.delete).toHaveBeenCalledWith({ where: { id: slip.id } });
    expect(transactionClient.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'deleted',
        before: slip,
        entityId: slip.id,
        entityType: 'vargani_slip',
        mandalId: slip.mandalId,
      }),
    });
  });
});
