const argon2 = require('../apps/api/node_modules/argon2');
const {
  PrismaClient,
  AccountStatus,
  FestivalStatus,
  PaymentMode,
  RenderStatus,
  SlipStatus,
  TemplateStatus,
  UserRole,
} = require('../packages/database/node_modules/@prisma/client');

const prisma = new PrismaClient();

const password = process.env.DEMO_LOGIN_PASSWORD;
const webBaseUrl = (process.env.DEMO_WEB_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!password || password.length < 12) {
  throw new Error('DEMO_LOGIN_PASSWORD is required and must be at least 12 characters.');
}

const mandal = {
  address: 'Prathama Building, S.R.P.F. Gate No. 1, Ramtekdi, Pune',
  city: 'Pune',
  contactName: 'Akhilnayak Demo Admin',
  contactPhone: '+919890978952',
  locality: 'Ramtekdi',
  name: 'Akhilnayak Mitra Mandal',
  slug: 'akhilnayak-mitra-mandal-ramtekdi',
  state: 'Maharashtra',
};

const users = [
  {
    areaName: 'Ramtekdi Main Road',
    email: 'admin@akhilnayak.local',
    name: 'Akhilnayak Admin',
    phone: '+919890978952',
    role: UserRole.MANDAL_ADMIN,
  },
  {
    areaName: 'Accounts Desk',
    email: 'khajindar@akhilnayak.local',
    name: 'Pravin Khajindar',
    phone: '+917747332829',
    role: UserRole.KHAJINDAR,
  },
  {
    areaName: 'SRPF Gate 1',
    email: 'sagar@akhilnayak.local',
    name: 'Sagar Jadhav',
    phone: '+919800000001',
    role: UserRole.GROUP_LEADER,
  },
  {
    areaName: 'Ramtekdi Market',
    email: 'neha@akhilnayak.local',
    name: 'Neha Pawar',
    phone: '+919800000002',
    role: UserRole.GROUP_LEADER,
  },
  {
    areaName: 'Prathama Building',
    email: 'amit@akhilnayak.local',
    name: 'Amit Shinde',
    phone: '+919800000003',
    role: UserRole.MEMBER,
  },
  {
    areaName: 'SRPF Gate 1',
    email: 'prachi@akhilnayak.local',
    name: 'Prachi More',
    phone: '+919800000004',
    role: UserRole.MEMBER,
  },
  {
    areaName: 'Ramtekdi Market',
    email: 'omkar@akhilnayak.local',
    name: 'Omkar Kale',
    phone: '+919800000005',
    role: UserRole.MEMBER,
  },
  {
    areaName: 'Ramtekdi Society Line',
    email: 'pooja@akhilnayak.local',
    name: 'Pooja Salunkhe',
    phone: '+919800000006',
    role: UserRole.MEMBER,
  },
];

const customFields = [
  {
    dashboardFilter: true,
    key: 'donor_type',
    label: 'Donor Type',
    options: ['Family', 'Shop', 'Sponsor'],
    printOnSlip: false,
    required: false,
    sortOrder: 1,
    type: 'DROPDOWN',
  },
  {
    dashboardFilter: true,
    key: 'building_name',
    label: 'Building / Lane',
    printOnSlip: true,
    required: false,
    sortOrder: 2,
    type: 'TEXT',
  },
  {
    dashboardFilter: false,
    key: 'receipt_note',
    label: 'Receipt Note',
    printOnSlip: false,
    required: false,
    sortOrder: 3,
    type: 'LONG_TEXT',
  },
];

const renderConfig = {
  fields: {
    amount: { color: '#111111', fontSize: 31, fontWeight: 900, width: 250, x: 720, y: 706 },
    building_name: { color: '#111111', fontSize: 24, fontWeight: 700, width: 420, x: 715, y: 648 },
    contributorAddress: {
      color: '#111111',
      fontSize: 27,
      fontWeight: 800,
      width: 560,
      x: 715,
      y: 612,
    },
    contributorName: {
      color: '#111111',
      fontSize: 30,
      fontWeight: 900,
      width: 610,
      x: 670,
      y: 544,
    },
    createdAt: {
      color: '#111111',
      fontSize: 25,
      fontWeight: 800,
      textAlign: 'center',
      width: 160,
      x: 1115,
      y: 478,
    },
    slipNumber: { color: '#b62028', fontSize: 31, fontWeight: 900, width: 100, x: 648, y: 470 },
  },
};

async function upsertUser(data, mandalId) {
  const passwordHash = await argon2.hash(password);
  return prisma.user.upsert({
    create: {
      email: data.email,
      mandalId,
      name: data.name,
      passwordHash,
      phone: data.phone,
      role: data.role,
      status: AccountStatus.ACTIVE,
    },
    update: {
      mandalId,
      name: data.name,
      passwordHash,
      phone: data.phone,
      role: data.role,
      status: AccountStatus.ACTIVE,
    },
    where: { email: data.email },
  });
}

async function main() {
  const createdMandal = await prisma.mandal.upsert({
    create: {
      ...mandal,
      plan: 'demo-enterprise',
      status: AccountStatus.ACTIVE,
    },
    update: {
      ...mandal,
      status: AccountStatus.ACTIVE,
    },
    where: { slug: mandal.slug },
  });

  const festival = await prisma.festival
    .upsert({
      create: {
        endDate: new Date('2026-09-06'),
        mandalId: createdMandal.id,
        name: 'Ganpati Festival 2026',
        startDate: new Date('2026-08-26'),
        status: FestivalStatus.ACTIVE,
        targetAmount: 1500000,
        type: 'GANPATI',
      },
      update: {
        endDate: new Date('2026-09-06'),
        name: 'Ganpati Festival 2026',
        startDate: new Date('2026-08-26'),
        status: FestivalStatus.ACTIVE,
        targetAmount: 1500000,
        type: 'GANPATI',
      },
      where: {
        id:
          (
            await prisma.festival.findFirst({
              select: { id: true },
              where: { mandalId: createdMandal.id, name: 'Ganpati Festival 2026' },
            })
          )?.id || '00000000-0000-0000-0000-000000000000',
      },
    })
    .catch(async () => {
      return prisma.festival.create({
        data: {
          endDate: new Date('2026-09-06'),
          mandalId: createdMandal.id,
          name: 'Ganpati Festival 2026',
          startDate: new Date('2026-08-26'),
          status: FestivalStatus.ACTIVE,
          targetAmount: 1500000,
          type: 'GANPATI',
        },
      });
    });

  await prisma.festival.updateMany({
    data: { status: FestivalStatus.COMPLETED },
    where: { id: { not: festival.id }, mandalId: createdMandal.id, status: FestivalStatus.ACTIVE },
  });
  await prisma.festival.update({
    data: { status: FestivalStatus.ACTIVE },
    where: { id: festival.id },
  });

  const createdUsers = new Map();
  for (const user of users) {
    createdUsers.set(user.email, await upsertUser(user, createdMandal.id));
  }

  const marketGroup = await prisma.memberGroup
    .upsert({
      create: {
        areaName: 'Ramtekdi Market',
        festivalId: festival.id,
        leaderUserId: createdUsers.get('neha@akhilnayak.local').id,
        mandalId: createdMandal.id,
        name: 'Market Collection Team',
      },
      update: {
        areaName: 'Ramtekdi Market',
        leaderUserId: createdUsers.get('neha@akhilnayak.local').id,
      },
      where: {
        id:
          (
            await prisma.memberGroup.findFirst({
              select: { id: true },
              where: {
                festivalId: festival.id,
                mandalId: createdMandal.id,
                name: 'Market Collection Team',
              },
            })
          )?.id || '00000000-0000-0000-0000-000000000000',
      },
    })
    .catch(() =>
      prisma.memberGroup.create({
        data: {
          areaName: 'Ramtekdi Market',
          festivalId: festival.id,
          leaderUserId: createdUsers.get('neha@akhilnayak.local').id,
          mandalId: createdMandal.id,
          name: 'Market Collection Team',
        },
      }),
    );

  const societyGroup = await prisma.memberGroup
    .upsert({
      create: {
        areaName: 'SRPF Gate 1',
        festivalId: festival.id,
        leaderUserId: createdUsers.get('sagar@akhilnayak.local').id,
        mandalId: createdMandal.id,
        name: 'Society Collection Team',
      },
      update: {
        areaName: 'SRPF Gate 1',
        leaderUserId: createdUsers.get('sagar@akhilnayak.local').id,
      },
      where: {
        id:
          (
            await prisma.memberGroup.findFirst({
              select: { id: true },
              where: {
                festivalId: festival.id,
                mandalId: createdMandal.id,
                name: 'Society Collection Team',
              },
            })
          )?.id || '00000000-0000-0000-0000-000000000000',
      },
    })
    .catch(() =>
      prisma.memberGroup.create({
        data: {
          areaName: 'SRPF Gate 1',
          festivalId: festival.id,
          leaderUserId: createdUsers.get('sagar@akhilnayak.local').id,
          mandalId: createdMandal.id,
          name: 'Society Collection Team',
        },
      }),
    );

  for (const user of users.filter((item) => item.role !== UserRole.MANDAL_ADMIN)) {
    const createdUser = createdUsers.get(user.email);
    const groupId = user.areaName.includes('Market') ? marketGroup.id : societyGroup.id;
    await prisma.member.upsert({
      create: {
        areaName: user.areaName,
        displayName: user.name,
        festivalId: festival.id,
        groupId,
        mandalId: createdMandal.id,
        phone: user.phone,
        status: AccountStatus.ACTIVE,
        userId: createdUser.id,
      },
      update: {
        areaName: user.areaName,
        displayName: user.name,
        groupId,
        phone: user.phone,
        status: AccountStatus.ACTIVE,
      },
      where: {
        mandalId_festivalId_userId: {
          festivalId: festival.id,
          mandalId: createdMandal.id,
          userId: createdUser.id,
        },
      },
    });
  }

  for (const field of customFields) {
    await prisma.customField.upsert({
      create: {
        dashboardFilter: field.dashboardFilter,
        festivalId: festival.id,
        key: field.key,
        label: field.label,
        mandalId: createdMandal.id,
        options: field.options || undefined,
        printOnSlip: field.printOnSlip,
        required: field.required,
        sortOrder: field.sortOrder,
        type: field.type,
      },
      update: {
        dashboardFilter: field.dashboardFilter,
        label: field.label,
        options: field.options || undefined,
        printOnSlip: field.printOnSlip,
        required: field.required,
        sortOrder: field.sortOrder,
        type: field.type,
      },
      where: {
        mandalId_festivalId_key: {
          festivalId: festival.id,
          key: field.key,
          mandalId: createdMandal.id,
        },
      },
    });
  }

  const template = await prisma.slipTemplate
    .upsert({
      create: {
        createdBy: createdUsers.get('admin@akhilnayak.local').id,
        festivalId: festival.id,
        mandalId: createdMandal.id,
        name: 'Akhilnayak Original Vargani Slip',
        status: TemplateStatus.ACTIVE,
      },
      update: {
        name: 'Akhilnayak Original Vargani Slip',
        status: TemplateStatus.ACTIVE,
      },
      where: {
        id:
          (
            await prisma.slipTemplate.findFirst({
              select: { id: true },
              where: {
                festivalId: festival.id,
                mandalId: createdMandal.id,
                name: 'Akhilnayak Original Vargani Slip',
              },
            })
          )?.id || '00000000-0000-0000-0000-000000000000',
      },
    })
    .catch(() =>
      prisma.slipTemplate.create({
        data: {
          createdBy: createdUsers.get('admin@akhilnayak.local').id,
          festivalId: festival.id,
          mandalId: createdMandal.id,
          name: 'Akhilnayak Original Vargani Slip',
          status: TemplateStatus.ACTIVE,
        },
      }),
    );

  const existingVersion = await prisma.slipTemplateVersion.findFirst({
    where: { templateId: template.id, version: 1 },
  });
  const version = existingVersion
    ? await prisma.slipTemplateVersion.update({
        data: {
          backgroundFileUrl: `${webBaseUrl}/templates/akhilnayak-mitra-mandal-vargani.jpeg`,
          canvasHeight: 800,
          canvasWidth: 1328,
          isActive: true,
          renderConfig,
        },
        where: { id: existingVersion.id },
      })
    : await prisma.slipTemplateVersion.create({
        data: {
          backgroundFileUrl: `${webBaseUrl}/templates/akhilnayak-mitra-mandal-vargani.jpeg`,
          canvasHeight: 800,
          canvasWidth: 1328,
          isActive: true,
          renderConfig,
          templateId: template.id,
          version: 1,
        },
      });

  await prisma.festival.update({
    data: { activeTemplateVersionId: version.id },
    where: { id: festival.id },
  });

  const collector = createdUsers.get('sagar@akhilnayak.local');
  const demoSlip = await prisma.varganiSlip.upsert({
    create: {
      amount: 5100,
      areaName: 'S.R.P.F. Gate No. 1',
      collectedByUserId: collector.id,
      contributorAddress: 'Prathama Building, Ramtekdi',
      contributorName: 'Mahesh Traders',
      contributorPhone: '+919876543210',
      customData: {
        building_name: 'Prathama Building',
        donor_type: 'Shop',
        receipt_note: 'Demo receipt for mandal presentation',
      },
      festivalId: festival.id,
      groupId: societyGroup.id,
      idempotencyKey: 'akhilnayak-demo-slip-003',
      mandalId: createdMandal.id,
      paymentMode: PaymentMode.UPI,
      renderStatus: RenderStatus.READY,
      shopName: 'Mahesh Traders',
      slipNumber: 'DM-GAN-2026-000003',
      status: SlipStatus.ACTIVE,
      templateVersionId: version.id,
    },
    update: {
      amount: 5100,
      contributorAddress: 'Prathama Building, Ramtekdi',
      contributorName: 'Mahesh Traders',
      customData: {
        building_name: 'Prathama Building',
        donor_type: 'Shop',
        receipt_note: 'Demo receipt for mandal presentation',
      },
      renderStatus: RenderStatus.READY,
      templateVersionId: version.id,
    },
    where: { idempotencyKey: 'akhilnayak-demo-slip-003' },
  });

  const slips = await prisma.varganiSlip.findMany({
    select: { slipNumber: true },
    where: { festivalId: festival.id, mandalId: createdMandal.id },
  });
  const maxSlipNumber = slips.reduce((max, slip) => {
    const parts = slip.slipNumber.split('-');
    const suffix = Number(parts[parts.length - 1] || 0);
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 3);

  await prisma.slipSequence.upsert({
    create: {
      currentValue: maxSlipNumber,
      festivalId: festival.id,
      mandalId: createdMandal.id,
    },
    update: {
      currentValue: maxSlipNumber,
    },
    where: {
      mandalId_festivalId: {
        festivalId: festival.id,
        mandalId: createdMandal.id,
      },
    },
  });

  await prisma.auditEvent.create({
    data: {
      action: 'seeded_demo',
      after: {
        festivalId: festival.id,
        mandalId: createdMandal.id,
        memberLogins: users.map((user) => user.email),
        templateVersionId: version.id,
      },
      entityId: createdMandal.id,
      entityType: 'mandal',
      mandalId: createdMandal.id,
    },
  });

  console.log(
    JSON.stringify(
      {
        demoSlipId: demoSlip.id,
        festivalId: festival.id,
        mandalId: createdMandal.id,
        templateVersionId: version.id,
        users: users.map((user) => ({ email: user.email, name: user.name, role: user.role })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
