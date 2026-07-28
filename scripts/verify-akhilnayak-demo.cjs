const { PrismaClient } = require('../packages/database/node_modules/@prisma/client');

const prisma = new PrismaClient();

const requiredUsers = [
  'admin@akhilnayak.local',
  'khajindar@akhilnayak.local',
  'sagar@akhilnayak.local',
  'neha@akhilnayak.local',
  'amit@akhilnayak.local',
  'prachi@akhilnayak.local',
  'omkar@akhilnayak.local',
  'pooja@akhilnayak.local',
];

async function main() {
  const mandal = await prisma.mandal.findUnique({
    where: { slug: 'akhilnayak-mitra-mandal-ramtekdi' },
  });

  if (!mandal) {
    throw new Error('Akhilnayak mandal was not found.');
  }

  const [users, festival, fields, demoSlip] = await Promise.all([
    prisma.user.findMany({
      select: { email: true, role: true, status: true },
      where: { mandalId: mandal.id },
    }),
    prisma.festival.findFirst({
      where: { mandalId: mandal.id, name: 'Ganpati Festival 2026', status: 'ACTIVE' },
    }),
    prisma.customField.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { key: true, type: true },
      where: { mandalId: mandal.id },
    }),
    prisma.varganiSlip.findUnique({
      select: { slipNumber: true, templateVersionId: true },
      where: { idempotencyKey: 'akhilnayak-demo-slip-003' },
    }),
  ]);

  const foundEmails = new Set(users.map((user) => user.email));
  const missingUsers = requiredUsers.filter((email) => !foundEmails.has(email));
  if (missingUsers.length) {
    throw new Error(`Missing demo users: ${missingUsers.join(', ')}`);
  }

  if (!festival) {
    throw new Error('Active Ganpati Festival 2026 was not found.');
  }

  const activeVersion = festival.activeTemplateVersionId
    ? await prisma.slipTemplateVersion.findUnique({
        select: { backgroundFileUrl: true, renderConfig: true },
        where: { id: festival.activeTemplateVersionId },
      })
    : null;

  const fieldKeys = fields.map((field) => field.key);
  for (const key of ['donor_type', 'building_name', 'receipt_note']) {
    if (!fieldKeys.includes(key)) {
      throw new Error(`Missing custom field: ${key}`);
    }
  }

  if (
    !activeVersion ||
    !activeVersion.backgroundFileUrl.includes('akhilnayak-mitra-mandal-vargani.jpeg')
  ) {
    throw new Error('Active template version does not use the Akhilnayak slip image.');
  }

  const renderFields = activeVersion.renderConfig?.fields || {};
  for (const key of [
    'slipNumber',
    'createdAt',
    'contributorName',
    'contributorAddress',
    'building_name',
    'amount',
  ]) {
    if (!renderFields[key]) {
      throw new Error(`Missing template placement: ${key}`);
    }
  }

  if (!demoSlip || demoSlip.slipNumber !== 'DM-GAN-2026-000003' || !demoSlip.templateVersionId) {
    throw new Error('Demo slip 003 is missing or not attached to a template.');
  }

  console.log(
    JSON.stringify(
      {
        customFields: fieldKeys,
        demoSlip: demoSlip.slipNumber,
        mandal: mandal.name,
        mandalId: mandal.id,
        templateImage: activeVersion.backgroundFileUrl,
        users: users.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
