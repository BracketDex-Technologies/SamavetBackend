import { createAccountingPdf } from './accounting-pdf';

describe('createAccountingPdf', () => {
  it('creates a readable multi-section accounting PDF', async () => {
    const stream = createAccountingPdf({
      expenseCategories: [
        { amount: 18500, count: 3, label: 'Decoration' },
        { amount: 9250, count: 2, label: 'Sound and lighting' },
      ],
      expenses: [
        {
          amount: 18500,
          category: 'Decoration',
          date: new Date('2026-08-01T00:00:00.000Z'),
          status: 'Approved',
          vendor: 'Shree Decorators',
        },
      ],
      festivalName: 'गणेशोत्सव 2026',
      filters: [],
      generatedAt: new Date('2026-08-03T08:30:00.000Z'),
      mandalName: 'गणेश मित्र मंडळ',
      paymentModes: [
        { amount: 72500, count: 42, label: 'UPI' },
        { amount: 45000, count: 31, label: 'Cash' },
      ],
      receipts: [
        {
          amount: 2501,
          collector: 'सागर जाधव',
          contributor: 'महेश ट्रेडर्स',
          date: new Date('2026-08-02T10:30:00.000Z'),
          paymentMode: 'UPI',
          slipNumber: 'DM-GAN-2026-000101',
          status: 'Paid',
        },
      ],
      reportPeriod: '01 Aug 2026 to 11 Aug 2026',
      summary: {
        approvedExpenseAmount: 27750,
        approvedExpenseCount: 5,
        balance: 89750,
        cancelledAmount: 1000,
        cancelledCount: 1,
        pendingAmount: 12500,
        pendingCount: 7,
        receivedAmount: 117500,
        receivedCount: 73,
        totalReceiptCount: 81,
      },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const file = Buffer.concat(chunks);

    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.length).toBeGreaterThan(8_000);
    expect(file.toString('latin1')).toContain('/Title');
    expect(file.toString('latin1')).toContain('/ToUnicode');
  });
});
