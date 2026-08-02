import { ForbiddenException } from '@nestjs/common';
import { PaymentMode, SlipStatus, UserRole } from '@prisma/client';
import { Workbook } from 'exceljs';
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

  it('exports every Vargani status as a formatted Excel workbook', async () => {
    const prisma = {
      festival: { findUnique: jest.fn().mockResolvedValue({ name: 'Ganeshotsav 2026' }) },
      mandal: { findUnique: jest.fn().mockResolvedValue({ name: 'Ganesh Mitra Mandal' }) },
      varganiSlip: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'slip-1',
            amount: 1251,
            areaName: 'Pune',
            collector: { name: 'Sagar Jadhav', phone: '+919999999999' },
            contributorAddress: 'Main Road',
            contributorName: 'Mahesh Traders',
            contributorPhone: '+918888888888',
            createdAt: new Date('2026-07-26T07:30:00.000Z'),
            customData: { donorType: 'Shop' },
            group: { name: 'Main Bazaar' },
            paymentMode: PaymentMode.UPI,
            shopName: 'Mahesh Traders',
            slipNumber: '003',
            status: SlipStatus.PENDING,
          },
        ]),
      },
    };
    const service = new ReportsService(prisma as never);

    const fileStream = await service.exportAllVarganiEntriesXlsx(mandalScopedCtx, 'mandal-1', 'festival-1', {});
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) chunks.push(Buffer.from(chunk));
    const file = Buffer.concat(chunks);
    const workbook = new Workbook();
    const workbookBytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(workbookBytes);
    const sheet = workbook.getWorksheet('Vargani Entries');

    expect(file.subarray(0, 2).toString()).toBe('PK');
    expect(sheet?.getCell('A1').value).toContain('Ganesh Mitra Mandal');
    expect(sheet?.getCell('A5').value).toBe('003');
    expect(sheet?.getCell('L5').value).toBe('Pending');
    expect(sheet?.getCell('M5').value).toBe(1251);
    expect(prisma.varganiSlip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
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
