import { ExpenseStatus, UserRole } from '@prisma/client';
import { ExpensesService } from './expenses.service';

describe('ExpensesService proof photos', () => {
  const ctx = {
    mandalId: 'mandal-1',
    role: UserRole.MANDAL_ADMIN,
    userId: 'user-1',
  };
  const dto = {
    amount: 3500,
    expenseDate: '2026-08-03',
    notes: 'Sound system advance',
    status: ExpenseStatus.APPROVED,
    vendorName: 'Festival Sound',
  };

  function setup() {
    const expenseCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      billFileUrl: data.billFileUrl ?? null,
      id: 'expense-1',
    }));
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        auditEvent: { create: jest.fn() },
        expense: { create: expenseCreate },
      })),
    };
    const storage = {
      resolveUrl: jest.fn(async (value: string | null) => value === 'supabase://proof'
        ? 'https://storage.example/proof.jpg'
        : value),
      uploadBuffer: jest.fn(async () => ({ url: 'supabase://proof' })),
    };

    return {
      expenseCreate,
      service: new ExpensesService(prisma as never, storage as never),
      storage,
    };
  }

  it('creates an expense without requiring a proof photo', async () => {
    const { expenseCreate, service, storage } = setup();

    const result = await service.createExpense(ctx, 'mandal-1', 'festival-1', dto);

    expect(storage.uploadBuffer).not.toHaveBeenCalled();
    expect(expenseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ billFileUrl: undefined }),
    }));
    expect(result.billFileUrl).toBeNull();
  });

  it('stores an uploaded proof privately and returns a viewable URL', async () => {
    const { expenseCreate, service, storage } = setup();
    const proofPhoto = {
      buffer: Buffer.from('proof'),
      mimetype: 'image/jpeg',
      originalname: 'vendor-bill.jpg',
    };

    const result = await service.createExpense(ctx, 'mandal-1', 'festival-1', dto, proofPhoto);

    expect(storage.uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({
      body: proofPhoto.buffer,
      contentType: 'image/jpeg',
      private: true,
    }));
    expect(expenseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ billFileUrl: 'supabase://proof' }),
    }));
    expect(result.billFileUrl).toBe('https://storage.example/proof.jpg');
  });
});
