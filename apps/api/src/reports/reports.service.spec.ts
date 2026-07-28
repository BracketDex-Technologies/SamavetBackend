import { ForbiddenException } from '@nestjs/common';
import { PaymentMode, UserRole } from '@prisma/client';
import { ReportsService, toCsv } from './reports.service';

const mandalScopedCtx = {
  mandalId: 'mandal-1',
  role: UserRole.MANDAL_ADMIN,
  userId: 'user-1',
};

describe('ReportsService', () => {
  it('exports filtered collection slips as CSV', async () => {
    const prisma = {
      varganiSlip: {
        findMany: jest.fn().mockResolvedValue([
          {
            amount: 501,
            areaName: 'Budhwar Peth',
            collector: { name: 'Sagar Jadhav', phone: '+919999999999' },
            contributorAddress: 'Pune',
            contributorName: 'Dagdu Halwai',
            contributorPhone: '+918888888888',
            createdAt: new Date('2026-07-26T07:30:00.000Z'),
            group: { name: 'Main Bazaar' },
            paymentMode: PaymentMode.UPI,
            shopName: 'Sweet, Shop',
            slipNumber: 'DM-GAN-2026-000001',
          },
        ]),
      },
    };
    const service = new ReportsService(prisma as never);

    const csv = await service.exportCollectionReportCsv(mandalScopedCtx, 'mandal-1', 'festival-1', {
      areaName: 'Budhwar Peth',
    });

    expect(prisma.varganiSlip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          areaName: 'Budhwar Peth',
          festivalId: 'festival-1',
          mandalId: 'mandal-1',
        }),
      }),
    );
    expect(csv).toContain('DM-GAN-2026-000001');
    expect(csv).toContain('"Sweet, Shop"');
    expect(csv).toContain('501.00');
  });

  it('rejects cross-mandal report access', async () => {
    const service = new ReportsService({} as never);

    await expect(
      service.exportCollectionReportCsv(mandalScopedCtx, 'mandal-2', 'festival-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('toCsv', () => {
  it('escapes quotes, commas, and newlines', () => {
    expect(
      toCsv([
        ['Name', 'Note'],
        ['A "VIP"', 'Line 1\nLine 2'],
      ]),
    ).toBe('Name,Note\n"A ""VIP""","Line 1\nLine 2"');
  });
});
