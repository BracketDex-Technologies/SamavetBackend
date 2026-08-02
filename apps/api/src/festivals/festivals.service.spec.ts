import { AccountStatus, FestivalStatus, UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { FestivalsService } from './festivals.service';

describe('FestivalsService year activation', () => {
  const ctx: AuthContext = {
    mandalId: 'mandal-1',
    role: UserRole.MANDAL_ADMIN,
    userId: 'admin-1',
  };

  it('creates a separate year and carries forward its reusable configuration', async () => {
    const createdFestival = {
      id: 'festival-2027',
      mandalId: 'mandal-1',
      name: 'Ganpati Festival 2027',
      status: FestivalStatus.DRAFT,
    };
    const activatedFestival = { ...createdFestival, status: FestivalStatus.ACTIVE };
    const tx = {
      customField: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{
          createdAt: new Date(),
          dashboardFilter: true,
          festivalId: 'festival-2026',
          id: 'field-1',
          key: 'building_name',
          label: 'Building / Lane',
          mandalId: 'mandal-1',
          options: null,
          printOnSlip: true,
          required: false,
          sortOrder: 1,
          type: 'TEXT',
          updatedAt: new Date(),
        }]),
      },
      festival: {
        create: jest.fn().mockResolvedValue(createdFestival),
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'festival-2026' }),
        update: jest.fn()
          .mockResolvedValueOnce({ ...createdFestival, activeTemplateVersionId: 'version-1' })
          .mockResolvedValueOnce(activatedFestival),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      member: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{
          areaName: 'Pune',
          createdAt: new Date(),
          displayName: 'Member One',
          festivalId: 'festival-2026',
          groupId: 'group-2026',
          id: 'member-2026',
          mandalId: 'mandal-1',
          phone: '9999999999',
          status: AccountStatus.ACTIVE,
          updatedAt: new Date(),
          userId: 'user-1',
        }]),
      },
      memberGroup: {
        create: jest.fn().mockResolvedValue({ id: 'group-2027' }),
        findMany: jest.fn().mockResolvedValue([{
          areaName: 'Pune',
          createdAt: new Date(),
          festivalId: 'festival-2026',
          id: 'group-2026',
          leaderUserId: 'user-1',
          mandalId: 'mandal-1',
          name: 'Main Group',
          updatedAt: new Date(),
        }]),
      },
      slipTemplate: {
        create: jest.fn().mockResolvedValue({ id: 'template-2027' }),
        findFirst: jest.fn().mockResolvedValue({
          name: 'Receipt Template',
          versions: [{
            backgroundFileUrl: '/receipt.svg',
            canvasHeight: 800,
            canvasWidth: 1328,
            renderConfig: { fields: {} },
          }],
        }),
      },
      slipTemplateVersion: {
        create: jest.fn().mockResolvedValue({ id: 'version-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new FestivalsService(prisma);

    const result = await service.activateYear(ctx, 'mandal-1', 2027);

    expect(result).toEqual(activatedFestival);
    expect(tx.festival.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Ganpati Festival 2027', status: FestivalStatus.DRAFT }),
    }));
    expect(tx.memberGroup.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ festivalId: 'festival-2027' }),
    }));
    expect(tx.member.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ festivalId: 'festival-2027', groupId: 'group-2027' })],
    }));
    expect(tx.slipTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ backgroundFileUrl: '/receipt.svg', version: 1 }),
    }));
    expect(tx.festival.updateMany).toHaveBeenCalledWith({
      data: { status: FestivalStatus.COMPLETED },
      where: {
        id: { not: 'festival-2027' },
        mandalId: 'mandal-1',
        status: FestivalStatus.ACTIVE,
      },
    });
  });
});
