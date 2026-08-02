import { CustomFieldType, FestivalStatus, Prisma, TemplateStatus } from '@prisma/client';

export const DEFAULT_TEMPLATE_BACKGROUND_URL = '/templates/default-vargani-receipt.svg';

export const defaultTemplateRenderConfig = {
  fields: {
    amount: { color: '#111111', fontSize: 31, fontWeight: 900, height: 52, textAlign: 'left', width: 250, x: 720, y: 680 },
    building_name: { color: '#111111', fontSize: 24, fontWeight: 700, height: 48, textAlign: 'left', width: 420, x: 715, y: 623 },
    contributorAddress: { color: '#111111', fontSize: 27, fontWeight: 800, height: 70, textAlign: 'left', textWrap: 'wrap', width: 560, x: 715, y: 574 },
    contributorName: { color: '#111111', fontSize: 30, fontWeight: 900, height: 58, textAlign: 'left', width: 610, x: 670, y: 515 },
    createdAt: { color: '#111111', fontSize: 25, fontWeight: 800, height: 46, textAlign: 'center', width: 160, x: 1115, y: 455 },
    slipNumber: { color: '#b62028', fontSize: 31, fontWeight: 900, height: 48, textAlign: 'left', width: 100, x: 648, y: 445 },
  },
};

const defaultCustomFields = [
  {
    dashboardFilter: true,
    key: 'donor_type',
    label: 'Donor Type',
    options: ['Family', 'Shop', 'Sponsor'],
    printOnSlip: false,
    required: false,
    sortOrder: 1,
    type: CustomFieldType.DROPDOWN,
  },
  {
    dashboardFilter: true,
    key: 'building_name',
    label: 'Building / Lane',
    options: undefined,
    printOnSlip: true,
    required: false,
    sortOrder: 2,
    type: CustomFieldType.TEXT,
  },
  {
    dashboardFilter: false,
    key: 'receipt_note',
    label: 'Receipt Note',
    options: undefined,
    printOnSlip: false,
    required: false,
    sortOrder: 3,
    type: CustomFieldType.LONG_TEXT,
  },
];

type JsonWriteValue = never;

export async function ensureDefaultMandalWorkspace(
  tx: Prisma.TransactionClient,
  input: {
    createdByUserId?: string | null;
    festivalYear?: number;
    mandalId: string;
    templateBackgroundUrl?: string;
  },
) {
  const selectedYearStart = input.festivalYear
    ? new Date(Date.UTC(input.festivalYear, 0, 1))
    : null;
  const selectedNextYearStart = input.festivalYear
    ? new Date(Date.UTC(input.festivalYear + 1, 0, 1))
    : null;
  const existingActiveFestival = await tx.festival.findFirst({
    orderBy: { startDate: 'desc' },
    where: input.festivalYear && selectedYearStart && selectedNextYearStart
      ? {
          mandalId: input.mandalId,
          startDate: { gte: selectedYearStart, lt: selectedNextYearStart },
        }
      : { mandalId: input.mandalId, status: FestivalStatus.ACTIVE },
  });
  const festival =
    existingActiveFestival ??
    (await tx.festival.create({
      data: {
        ...(input.festivalYear ? ganpatiFestivalWindow(input.festivalYear) : nextGanpatiFestivalWindow()),
        mandalId: input.mandalId,
        status: FestivalStatus.ACTIVE,
      },
    }));

  for (const field of defaultCustomFields) {
    await tx.customField.upsert({
      create: {
        dashboardFilter: field.dashboardFilter,
        festivalId: festival.id,
        key: field.key,
        label: field.label,
        mandalId: input.mandalId,
        options: field.options ? toJson(field.options) : undefined,
        printOnSlip: field.printOnSlip,
        required: field.required,
        sortOrder: field.sortOrder,
        type: field.type,
      },
      update: {},
      where: {
        mandalId_festivalId_key: {
          festivalId: festival.id,
          key: field.key,
          mandalId: input.mandalId,
        },
      },
    });
  }

  const existingTemplate = await tx.slipTemplate.findFirst({
    orderBy: { createdAt: 'asc' },
    where: { festivalId: festival.id, mandalId: input.mandalId },
  });
  const template =
    existingTemplate ??
    (await tx.slipTemplate.create({
      data: {
        createdBy: input.createdByUserId ?? undefined,
        festivalId: festival.id,
        mandalId: input.mandalId,
        name: 'Default Vargani Receipt Template',
        status: TemplateStatus.ACTIVE,
      },
    }));

  const activeVersion = festival.activeTemplateVersionId
    ? await tx.slipTemplateVersion.findFirst({
        where: { id: festival.activeTemplateVersionId, templateId: template.id },
      })
    : await tx.slipTemplateVersion.findFirst({
        orderBy: { version: 'desc' },
        where: { isActive: true, templateId: template.id },
      });

  if (activeVersion) {
    await tx.slipTemplate.update({
      data: { status: TemplateStatus.ACTIVE },
      where: { id: template.id },
    });
    const activeFestival = festival.activeTemplateVersionId === activeVersion.id
      ? festival
      : await tx.festival.update({
          data: { activeTemplateVersionId: activeVersion.id },
          where: { id: festival.id },
        });

    return { activeFestival, template, templateVersion: activeVersion };
  }

  const latest = await tx.slipTemplateVersion.aggregate({
    _max: { version: true },
    where: { templateId: template.id },
  });
  const templateVersion = await tx.slipTemplateVersion.create({
    data: {
      backgroundFileUrl: input.templateBackgroundUrl ?? DEFAULT_TEMPLATE_BACKGROUND_URL,
      canvasHeight: 800,
      canvasWidth: 1328,
      isActive: true,
      renderConfig: toJson(defaultTemplateRenderConfig),
      templateId: template.id,
      version: (latest._max.version ?? 0) + 1,
    },
  });

  await tx.slipTemplate.update({
    data: { status: TemplateStatus.ACTIVE },
    where: { id: template.id },
  });
  const activeFestival = await tx.festival.update({
    data: { activeTemplateVersionId: templateVersion.id },
    where: { id: festival.id },
  });

  return { activeFestival, template, templateVersion };
}

export function nextGanpatiFestivalWindow() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const year = now.getUTCMonth() > 8 ? currentYear + 1 : currentYear;

  return ganpatiFestivalWindow(year);
}

export function ganpatiFestivalWindow(year: number) {
  return {
    endDate: new Date(Date.UTC(year, 8, 30)),
    name: `Ganpati Festival ${year}`,
    startDate: new Date(Date.UTC(year, 7, 1)),
    type: 'GANPATI',
  };
}

function toJson(value: unknown): JsonWriteValue {
  return value as JsonWriteValue;
}
