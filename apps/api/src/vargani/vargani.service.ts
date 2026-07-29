import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomFieldType,
  FestivalStatus,
  RenderStatus,
  SlipStatus,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthContext } from '../auth/auth-context';
import { requireMandalId } from '../auth/tenant-scope';
import { AppConfig } from '../config/app-config';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelSlipDto } from './dto/cancel-slip.dto';
import { CreateVarganiSlipDto } from './dto/create-vargani-slip.dto';
import { ShareSlipDto } from './dto/share-slip.dto';
import { UpdateVarganiSlipDto } from './dto/update-vargani-slip.dto';

interface SequenceRow {
  current_value: bigint;
}

type JsonWriteValue = never;

function isCollectorRole(role: UserRole) {
  return role === UserRole.MEMBER || role === UserRole.GROUP_LEADER;
}

interface SlipListWhere {
  collectedByUserId?: string;
  festivalId: string;
  mandalId: string;
}

interface TemplateFieldPlacement {
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: 'italic' | 'normal';
  fontWeight?: number | string;
  height?: number;
  letterSpacing?: number;
  lineHeight?: number;
  opacity?: number;
  padding?: number;
  rotate?: number;
  shadow?: boolean;
  textAlign?: 'center' | 'left' | 'right';
  textDecoration?: string;
  textTransform?: string;
  textWrap?: 'shrink' | 'single' | 'wrap';
  width?: number;
  x: number;
  y: number;
}

interface TemplateRenderConfig {
  fields?: Record<string, TemplateFieldPlacement>;
}

type SlipWithTemplate = Awaited<ReturnType<VarganiService['getSlip']>> & {
  templateVersion: NonNullable<Awaited<ReturnType<VarganiService['getSlip']>>['templateVersion']>;
};

@Injectable()
export class VarganiService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async getActiveForm(ctx: AuthContext) {
    const mandalId = requireMandalId(ctx);
    const festival = await this.getActiveFestival(mandalId);
    const [member, customFields] = await Promise.all([
      this.prisma.member.findFirst({
        include: { group: true },
        where: { festivalId: festival.id, mandalId, userId: ctx.userId },
      }),
      this.prisma.customField.findMany({
        orderBy: { sortOrder: 'asc' },
        where: { festivalId: festival.id, mandalId },
      }),
    ]);

    return {
      customFields,
      festival,
      member,
      systemFields: [
        'contributorName',
        'contributorPhone',
        'contributorAddress',
        'shopName',
        'amount',
        'paymentMode',
        'areaName',
      ],
    };
  }

  async createSlip(ctx: AuthContext, dto: CreateVarganiSlipDto) {
    const mandalId = requireMandalId(ctx);
    const festival = await this.getActiveFestival(mandalId);
    const member = await this.prisma.member.findFirst({
      where: { festivalId: festival.id, mandalId, userId: ctx.userId },
    });

    if (!member && isCollectorRole(ctx.role)) {
      throw new ForbiddenException('Member is not assigned to the active festival.');
    }

    let groupId = member?.groupId ?? null;
    const canAssignGroup = ctx.role === UserRole.MANDAL_ADMIN || ctx.role === UserRole.KHAJINDAR;
    if (dto.groupId && canAssignGroup) {
      const group = await this.prisma.memberGroup.findFirst({
        where: { festivalId: festival.id, id: dto.groupId, mandalId },
      });

      if (!group) {
        throw new NotFoundException('Collection group not found.');
      }

      groupId = group.id;
    }

    const customFields = await this.prisma.customField.findMany({
      where: { festivalId: festival.id, mandalId },
    });
    this.validateCustomData(customFields, dto.customData ?? {});

    if (dto.idempotencyKey) {
      const existing = await this.prisma.varganiSlip.findUnique({
        include: {
          collector: { select: { id: true, name: true, phone: true } },
        },
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existing) {
        return existing;
      }
    }

    const slip = await this.prisma.$transaction(async (tx) => {
      const nextValue = await this.nextSlipSequence(tx, mandalId, festival.id);
      const slipStatus = dto.status === SlipStatus.PENDING ? SlipStatus.PENDING : SlipStatus.ACTIVE;
      const slipNumber = `DM-${festival.type.slice(0, 3).toUpperCase()}-${new Date(festival.startDate).getFullYear()}-${String(nextValue).padStart(6, '0')}`;

      const slip = await tx.varganiSlip.create({
        include: {
          collector: { select: { id: true, name: true, phone: true } },
        },
        data: {
          amount: dto.amount,
          areaName: dto.areaName ?? member?.areaName,
          collectedByUserId: ctx.userId,
          contributorAddress: dto.contributorAddress,
          contributorName: dto.contributorName,
          contributorPhone: dto.contributorPhone,
          customData: toJsonWriteValue(dto.customData ?? {}),
          festivalId: festival.id,
          groupId,
          idempotencyKey: dto.idempotencyKey,
          mandalId,
          paymentMode: dto.paymentMode,
          renderStatus: slipStatus === SlipStatus.PENDING ? RenderStatus.PENDING : RenderStatus.READY,
          shopName: dto.shopName,
          slipNumber,
          status: slipStatus,
          templateVersionId: festival.activeTemplateVersionId,
        },
      });

      await tx.auditEvent.create({
        data: {
          action: 'created',
          after: toJsonWriteValue(slip),
          actorUserId: ctx.userId,
          entityId: slip.id,
          entityType: 'vargani_slip',
          mandalId,
        },
      });

      return slip;
    });

    if (slip.status === SlipStatus.ACTIVE) {
      await this.jobsService.enqueue({
        mandalId,
        payload: {
          festivalId: festival.id,
          slipId: slip.id,
          slipNumber: slip.slipNumber,
          templateVersionId: slip.templateVersionId,
        },
        type: 'RENDER_RECEIPT',
      });
    }

    return slip;
  }

  async listSlips(ctx: AuthContext, query: PaginationQueryDto) {
    const mandalId = requireMandalId(ctx);
    const festival = await this.getActiveFestival(mandalId);
    const skip = (query.page - 1) * query.limit;
    const where: SlipListWhere = {
      festivalId: festival.id,
      mandalId,
    };

    if (isCollectorRole(ctx.role)) {
      where.collectedByUserId = ctx.userId;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.varganiSlip.findMany({
        include: {
          collector: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        where,
      }),
      this.prisma.varganiSlip.count({ where }),
    ]);

    return {
      items,
      meta: {
        limit: query.limit,
        page: query.page,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getSlip(ctx: AuthContext, id: string) {
    const mandalId = requireMandalId(ctx);
    const slip = await this.prisma.varganiSlip.findFirst({
      include: {
        collector: { select: { id: true, name: true, phone: true } },
        festival: true,
        group: true,
        templateVersion: true,
      },
      where: { id, mandalId },
    });

    if (!slip || (isCollectorRole(ctx.role) && slip.collectedByUserId !== ctx.userId)) {
      throw new NotFoundException('Slip not found.');
    }

    return slip;
  }

  async renderReceiptHtml(ctx: AuthContext, id: string) {
    const slip = await this.getSlip(ctx, id);
    if (slip.status !== SlipStatus.ACTIVE) {
      throw new BadRequestException('Receipt is available only after payment is received.');
    }
    return this.renderReceiptForSlip(slip);
  }

  async recordShare(ctx: AuthContext, id: string, dto: ShareSlipDto) {
    const slip = await this.getSlip(ctx, id);
    if (slip.status !== SlipStatus.ACTIVE) {
      throw new BadRequestException('Receipt can be shared only after payment is received.');
    }

    const shareToken = randomBytes(32).toString('base64url');
    const shareTokenHash = hashShareToken(shareToken);
    const shareTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const receiptUrl = this.publicReceiptUrl(shareToken);

    const [, event] = await this.prisma.$transaction([
      this.prisma.varganiSlip.update({
        data: {
          publicShareTokenExpiresAt: shareTokenExpiresAt,
          publicShareTokenHash: shareTokenHash,
        },
        where: { id: slip.id },
      }),
      this.prisma.auditEvent.create({
        data: {
          action: 'shared_receipt',
          actorUserId: ctx.userId,
          entityId: slip.id,
          entityType: 'vargani_slip',
          mandalId: slip.mandalId,
          metadata: toJsonWriteValue({
            channel: dto.channel?.trim() || 'WHATSAPP',
            expiresAt: shareTokenExpiresAt.toISOString(),
            phone: dto.phone?.trim() || slip.contributorPhone || null,
            receiptUrl,
            slipNumber: slip.slipNumber,
          }),
        },
      }),
    ]);

    await this.jobsService.enqueue({
      mandalId: slip.mandalId,
      payload: {
        auditEventId: event.id,
        channel: dto.channel?.trim() || 'WHATSAPP',
        phone: dto.phone?.trim() || slip.contributorPhone || null,
        receiptUrl,
        slipId: slip.id,
        slipNumber: slip.slipNumber,
      },
      type: 'WHATSAPP_SHARE_AUDIT',
    });

    return {
      auditEventId: event.id,
      expiresAt: shareTokenExpiresAt,
      ok: true,
      receiptUrl,
      sharedAt: event.createdAt,
    };
  }

  async renderPublicReceiptHtmlByToken(token: string) {
    const tokenHash = hashShareToken(token);
    const slip = await this.prisma.varganiSlip.findFirst({
      include: {
        collector: { select: { id: true, name: true, phone: true } },
        festival: true,
        group: true,
        templateVersion: true,
      },
      where: {
        publicShareTokenExpiresAt: { gt: new Date() },
        publicShareTokenHash: tokenHash,
        status: SlipStatus.ACTIVE,
      },
    });

    if (!slip) {
      throw new NotFoundException('Receipt not found.');
    }

    return this.renderReceiptForSlip(slip);
  }

  async renderPublicReceiptHtml(id: string, token?: string) {
    if (!token) {
      throw new NotFoundException('Receipt not found.');
    }

    const tokenHash = hashShareToken(token);
    const slip = await this.prisma.varganiSlip.findFirst({
      include: {
        collector: { select: { id: true, name: true, phone: true } },
        festival: true,
        group: true,
        templateVersion: true,
      },
      where: {
        id,
        publicShareTokenExpiresAt: { gt: new Date() },
        publicShareTokenHash: tokenHash,
        status: SlipStatus.ACTIVE,
      },
    });

    if (!slip) {
      throw new NotFoundException('Receipt not found.');
    }

    return this.renderReceiptForSlip(slip);
  }

  private publicReceiptUrl(token: string) {
    const configuredBase = this.config.get('PUBLIC_API_BASE_URL', { infer: true });
    const baseUrl = (configuredBase || 'https://digital-vargani-api.vercel.app').replace(/\/$/, '');
    const apiBaseUrl = /\/api\/v\d+$/.test(baseUrl)
      ? baseUrl
      : baseUrl.endsWith('/api')
        ? `${baseUrl}/v1`
        : `${baseUrl}/api/v1`;
    return `${apiBaseUrl}/public/vargani/receipts/${encodeURIComponent(token)}.html`;
  }

  private async renderReceiptForSlip(slip: Awaited<ReturnType<VarganiService['getSlip']>>) {
    const customFields = await this.prisma.customField.findMany({
      orderBy: { sortOrder: 'asc' },
      where: { festivalId: slip.festivalId, mandalId: slip.mandalId, printOnSlip: true },
    });
    const customData =
      slip.customData && typeof slip.customData === 'object' && !Array.isArray(slip.customData)
        ? (slip.customData as Record<string, unknown>)
        : {};

    if (slip.templateVersion) {
      return this.renderTemplateReceiptHtml(slip as SlipWithTemplate, customFields, customData);
    }

    const customRows = customFields
      .map((field) => {
        const value = customData[field.key];
        if (value === undefined || value === null || value === '') {
          return '';
        }

        return `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`;
      })
      .join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(slip.slipNumber)} - Digital Vargani Receipt</title>
  <style>
    body { background: #f5f1e8; color: #171717; font-family: Arial, sans-serif; margin: 0; padding: 24px; }
    .receipt { background: #fffdf8; border: 2px solid #7f1d1d; border-radius: 8px; margin: 0 auto; max-width: 760px; padding: 28px; }
    .top { align-items: center; display: flex; justify-content: space-between; gap: 16px; }
    h1, p { margin: 0; }
    h1 { color: #7f1d1d; font-size: 28px; }
    .number { background: #fff2d8; border: 1px dashed #a94b2b; border-radius: 8px; font-size: 20px; font-weight: 800; margin: 22px 0; padding: 14px; text-align: center; }
    dl { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
    dl div { border-bottom: 1px solid #ead7b3; padding-bottom: 10px; }
    dt { color: #6a655d; font-size: 12px; text-transform: uppercase; }
    dd { font-size: 17px; font-weight: 700; margin: 3px 0 0; }
    .amount { align-items: center; background: #7f1d1d; border-radius: 8px; color: #fff; display: flex; justify-content: space-between; margin-top: 22px; padding: 16px; }
    .amount strong { font-size: 32px; }
    .footer { border-top: 1px solid #ead7b3; color: #0f8b63; display: flex; justify-content: space-between; margin-top: 22px; padding-top: 14px; }
    @media print { body { background: #fff; padding: 0; } .receipt { border-radius: 0; max-width: none; } }
  </style>
</head>
<body>
  <main class="receipt">
    <section class="top">
      <div>
        <h1>${escapeHtml(slip.festival.name)}</h1>
        <p>Digital Vargani Receipt</p>
      </div>
      <strong>${escapeHtml(slip.festival.type)}</strong>
    </section>
    <div class="number">${escapeHtml(slip.slipNumber)}</div>
    <dl>
      <div><dt>Name</dt><dd>${escapeHtml(slip.contributorName)}</dd></div>
      <div><dt>Shop</dt><dd>${escapeHtml(slip.shopName ?? '-')}</dd></div>
      <div><dt>Phone</dt><dd>${escapeHtml(slip.contributorPhone ?? '-')}</dd></div>
      <div><dt>Area</dt><dd>${escapeHtml(slip.areaName ?? '-')}</dd></div>
      <div><dt>Payment</dt><dd>${escapeHtml(slip.paymentMode)}</dd></div>
      <div><dt>Collected By</dt><dd>${escapeHtml(slip.collector.name)}</dd></div>
      ${customRows}
    </dl>
    <section class="amount"><span>Amount Received</span><strong>Rs. ${Number(slip.amount).toLocaleString('en-IN')}</strong></section>
    <section class="footer"><span>${escapeHtml(slip.createdAt.toISOString())}</span><strong>Verified Digital Slip</strong></section>
  </main>
</body>
</html>`;
  }

  private renderTemplateReceiptHtml(
    slip: SlipWithTemplate,
    customFields: Array<{ key: string; label: string }>,
    customData: Record<string, unknown>,
  ) {
    const template = slip.templateVersion;
    const renderConfig = template.renderConfig as TemplateRenderConfig;
    const backgroundFileUrl = this.resolveTemplateBackgroundUrl(template.backgroundFileUrl);
    const fieldValues: Record<string, string> = {
      amount: Number(slip.amount).toLocaleString('en-IN'),
      amountWords: amountToIndianWords(Number(slip.amount)),
      amountWordsMarathi: amountToMarathiWords(Number(slip.amount)),
      areaName: slip.areaName ?? '',
      building_name: String(customData.building_name ?? ''),
      collectorName: slip.collector.name,
      contributorAddress: slip.contributorAddress ?? '',
      contributorName: slip.contributorName,
      contributorPhone: slip.contributorPhone ?? '',
      createdAt: new Intl.DateTimeFormat('en-IN').format(slip.createdAt),
      donorType: String(customData.donorType ?? ''),
      paymentMode: slip.paymentMode,
      shopName: slip.shopName ?? '',
      slipNumber: lastSlipNumberPart(slip.slipNumber).replace(/^0+/, '') || slip.slipNumber,
    };

    for (const field of customFields) {
      const value = customData[field.key];
      if (value !== undefined && value !== null) {
        fieldValues[field.key] = String(value);
      }
    }

    const overlays = Object.entries(renderConfig.fields ?? {})
      .map(([key, placement]) => {
        const value = fieldValues[baseTemplateFieldKey(key)];
        if (!value) {
          return '';
        }

        return `<span class="field" style="${fieldStyle(placement)}">${escapeHtml(value)}</span>`;
      })
      .join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(slip.slipNumber)} - Digital Vargani Receipt</title>
  <style>
    body { background: #f3f0e8; font-family: Arial, sans-serif; margin: 0; padding: 24px; }
    .sheet { background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,.16); margin: 0 auto; position: relative; width: min(100%, ${template.canvasWidth}px); }
    .sheet::before { content: ""; display: block; padding-top: ${(template.canvasHeight / template.canvasWidth) * 100}%; }
    .background, .layer { inset: 0; position: absolute; }
    .background { height: 100%; object-fit: contain; width: 100%; }
    .field { box-sizing: border-box; color: #111; overflow: hidden; position: absolute; white-space: nowrap; }
    @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; width: ${template.canvasWidth}px; } }
  </style>
</head>
<body>
  <main class="sheet">
    <img class="background" src="${escapeHtml(backgroundFileUrl)}" alt="" />
    <section class="layer" aria-label="Receipt fields">${overlays}</section>
  </main>
</body>
</html>`;
  }

  private resolveTemplateBackgroundUrl(rawUrl: string) {
    const webBaseUrl = this.config.get('PUBLIC_WEB_BASE_URL', { infer: true }).replace(/\/$/, '');
    const fallbackUrl = `${webBaseUrl}/templates/default-vargani-receipt.svg`;
    const value = rawUrl?.trim();

    if (!value) return fallbackUrl;
    if (value.startsWith('/')) return `${webBaseUrl}${value}`;

    try {
      const url = new URL(value);
      const isLocalTemplateAsset =
        ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/templates/');
      if (isLocalTemplateAsset) return `${webBaseUrl}${url.pathname}${url.search}`;
    } catch {
      return value;
    }

    return value;
  }

  async cancelSlip(ctx: AuthContext, id: string, dto: CancelSlipDto) {
    const mandalId = requireMandalId(ctx);
    const slip = await this.prisma.varganiSlip.findFirst({ where: { id, mandalId } });

    if (!slip) {
      throw new NotFoundException('Slip not found.');
    }

    if (isCollectorRole(ctx.role) && slip.collectedByUserId !== ctx.userId) {
      throw new ForbiddenException('Collectors can cancel only their own slips.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.varganiSlip.update({
        data: {
          cancellationReason: dto.reason,
          cancelledAt: new Date(),
          status: SlipStatus.CANCELLED,
        },
        where: { id },
      });

      await tx.auditEvent.create({
        data: {
          action: 'cancelled',
          actorUserId: ctx.userId,
          before: toJsonWriteValue(slip),
          after: toJsonWriteValue(updated),
          entityId: id,
          entityType: 'vargani_slip',
          mandalId,
        },
      });

      return updated;
    });
  }

  async updateSlip(ctx: AuthContext, id: string, dto: UpdateVarganiSlipDto) {
    const mandalId = requireMandalId(ctx);
    const slip = await this.prisma.varganiSlip.findFirst({ where: { id, mandalId } });

    if (!slip) {
      throw new NotFoundException('Slip not found.');
    }

    if (isCollectorRole(ctx.role) && slip.collectedByUserId !== ctx.userId) {
      throw new ForbiddenException('Collectors can update only their own slips.');
    }

    if (slip.status === SlipStatus.CANCELLED) {
      throw new BadRequestException('Cancelled slips cannot be updated.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.varganiSlip.update({
        data: {
          amount: dto.amount,
          areaName: dto.areaName,
          contributorAddress: dto.contributorAddress,
          contributorName: dto.contributorName,
          contributorPhone: dto.contributorPhone,
          customData: dto.customData ? toJsonWriteValue(dto.customData) : undefined,
          paymentMode: dto.paymentMode,
          renderStatus: dto.customData ? RenderStatus.PENDING : undefined,
          shopName: dto.shopName,
          status: dto.status,
        },
        where: { id },
      });

      await tx.auditEvent.create({
        data: {
          action: 'slip_updated',
          actorUserId: ctx.userId,
          after: toJsonWriteValue(updated),
          before: toJsonWriteValue(slip),
          entityId: id,
          entityType: 'vargani_slip',
          mandalId,
        },
      });

      return updated;
    });
  }

  private async getActiveFestival(mandalId: string) {
    const festival = await this.prisma.festival.findFirst({
      where: { mandalId, status: FestivalStatus.ACTIVE },
    });

    if (!festival) {
      throw new NotFoundException('No active festival found.');
    }

    return festival;
  }

  private async nextSlipSequence(
    tx: {
      $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
      $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
    },
    mandalId: string,
    festivalId: string,
  ): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO "slip_sequences" ("id", "mandal_id", "festival_id", "current_value", "updated_at")
      VALUES (${randomUUID()}::uuid, ${mandalId}::uuid, ${festivalId}::uuid, 0, now())
      ON CONFLICT ("mandal_id", "festival_id") DO NOTHING
    `;

    const rows = await tx.$queryRaw<SequenceRow[]>`
      UPDATE "slip_sequences"
      SET "current_value" = "current_value" + 1, "updated_at" = now()
      WHERE "mandal_id" = ${mandalId}::uuid AND "festival_id" = ${festivalId}::uuid
      RETURNING "current_value"
    `;

    if (!rows[0]) {
      throw new BadRequestException('Could not generate slip number.');
    }

    return Number(rows[0].current_value);
  }

  private validateCustomData(
    customFields: Array<{ key: string; label: string; required: boolean; type: CustomFieldType }>,
    customData: Record<string, unknown>,
  ) {
    for (const field of customFields) {
      const value = customData[field.key];

      if (field.required && (value === undefined || value === null || value === '')) {
        throw new BadRequestException(`${field.label} is required.`);
      }
    }
  }
}

function toJsonWriteValue(value: unknown): JsonWriteValue {
  return value as JsonWriteValue;
}

function lastSlipNumberPart(slipNumber: string): string {
  const parts = slipNumber.split('-');
  return parts[parts.length - 1] ?? slipNumber;
}

function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fieldStyle(placement: TemplateFieldPlacement): string {
  const declarations = [
    `left:${placement.x}px`,
    `top:${placement.y}px`,
    `font-size:${placement.fontSize ?? 28}px`,
    `font-family:${placement.fontFamily ?? 'Arial, sans-serif'}`,
    `font-style:${placement.fontStyle ?? 'normal'}`,
    `font-weight:${placement.fontWeight ?? 800}`,
    `color:${placement.color ?? '#111'}`,
    `text-align:${placement.textAlign ?? 'left'}`,
    `line-height:${placement.lineHeight ?? 1.08}`,
    `letter-spacing:${placement.letterSpacing ?? 0}px`,
    `opacity:${placement.opacity ?? 1}`,
    `padding:${placement.padding ?? 0}px`,
    `text-decoration:${placement.textDecoration ?? 'none'}`,
    `text-transform:${placement.textTransform ?? 'none'}`,
    `transform:rotate(${placement.rotate ?? 0}deg)`,
    `white-space:${placement.textWrap === 'wrap' ? 'normal' : 'nowrap'}`,
    `word-break:${placement.textWrap === 'wrap' ? 'break-word' : 'normal'}`,
  ];

  if (placement.width) {
    declarations.push(`width:${placement.width}px`);
  }

  if (placement.height) {
    declarations.push(`height:${placement.height}px`);
  }

  if (shouldPrintFieldBackground(placement.backgroundColor)) {
    declarations.push(`background:${placement.backgroundColor}`);
  }

  if (shouldPrintFieldBorder(placement.borderColor)) {
    declarations.push(`border:1px solid ${placement.borderColor}`);
  }

  if (placement.borderRadius) {
    declarations.push(`border-radius:${placement.borderRadius}px`);
  }

  if (placement.shadow) {
    declarations.push('text-shadow:0 2px 4px rgba(0,0,0,.35)');
  }

  return declarations.join(';');
}

function normalizeCssColor(value?: string): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '');
}

function shouldPrintFieldBackground(value?: string): boolean {
  const color = normalizeCssColor(value);
  return Boolean(color) && color !== 'transparent' && color !== 'rgba(255,255,255,0.78)';
}

function shouldPrintFieldBorder(value?: string): boolean {
  const color = normalizeCssColor(value);
  return Boolean(color) && color !== 'transparent' && color !== '#ff4f0a';
}

function baseTemplateFieldKey(key: string): string {
  return key.replace(/_copy_\d+$/, '');
}

const INDIAN_NUMBER_ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const INDIAN_NUMBER_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function amountToIndianWords(value: number): string {
  const amount = Math.floor(value);
  if (!Number.isFinite(amount) || amount < 0) return '';
  return `${numberToIndianWords(amount)} Rupees Only`;
}

function numberToIndianWords(value: number): string {
  if (value === 0) return 'Zero';
  const parts: string[] = [];
  let remainder = value;
  const scales = [
    { label: 'Crore', value: 10000000 },
    { label: 'Lakh', value: 100000 },
    { label: 'Thousand', value: 1000 },
  ];

  scales.forEach((scale) => {
    const count = Math.floor(remainder / scale.value);
    if (count > 0) {
      parts.push(`${numberBelowThousand(count)} ${scale.label}`);
      remainder %= scale.value;
    }
  });

  if (remainder > 0) {
    parts.push(numberBelowThousand(remainder));
  }

  return parts.join(' ');
}

function numberBelowThousand(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;

  if (hundreds > 0) {
    parts.push(`${INDIAN_NUMBER_ONES[hundreds]} Hundred`);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(INDIAN_NUMBER_ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones ? `${INDIAN_NUMBER_TENS[tens]} ${INDIAN_NUMBER_ONES[ones]}` : INDIAN_NUMBER_TENS[tens]);
    }
  }

  return parts.join(' ');
}

const MARATHI_NUMBER_BELOW_HUNDRED = [
  'शून्य',
  'एक',
  'दोन',
  'तीन',
  'चार',
  'पाच',
  'सहा',
  'सात',
  'आठ',
  'नऊ',
  'दहा',
  'अकरा',
  'बारा',
  'तेरा',
  'चौदा',
  'पंधरा',
  'सोळा',
  'सतरा',
  'अठरा',
  'एकोणीस',
  'वीस',
  'एकवीस',
  'बावीस',
  'तेवीस',
  'चोवीस',
  'पंचवीस',
  'सव्वीस',
  'सत्तावीस',
  'अठ्ठावीस',
  'एकोणतीस',
  'तीस',
  'एकतीस',
  'बत्तीस',
  'तेहतीस',
  'चौतीस',
  'पस्तीस',
  'छत्तीस',
  'सदतीस',
  'अडतीस',
  'एकोणचाळीस',
  'चाळीस',
  'एकेचाळीस',
  'बेचाळीस',
  'त्रेचाळीस',
  'चव्वेचाळीस',
  'पंचेचाळीस',
  'सेहेचाळीस',
  'सत्तेचाळीस',
  'अठ्ठेचाळीस',
  'एकोणपन्नास',
  'पन्नास',
  'एकावन्न',
  'बावन्न',
  'त्रेपन्न',
  'चौपन्न',
  'पंचावन्न',
  'छप्पन्न',
  'सत्तावन्न',
  'अठ्ठावन्न',
  'एकोणसाठ',
  'साठ',
  'एकसष्ट',
  'बासष्ट',
  'त्रेसष्ट',
  'चौसष्ट',
  'पासष्ट',
  'सहासष्ट',
  'सदुसष्ट',
  'अडुसष्ट',
  'एकोणसत्तर',
  'सत्तर',
  'एकाहत्तर',
  'बाहत्तर',
  'त्र्याहत्तर',
  'चौर्याहत्तर',
  'पंच्याहत्तर',
  'शहात्तर',
  'सत्याहत्तर',
  'अठ्ठ्याहत्तर',
  'एकोणऐंशी',
  'ऐंशी',
  'एक्याऐंशी',
  'ब्याऐंशी',
  'त्र्याऐंशी',
  'चौर्याऐंशी',
  'पंच्याऐंशी',
  'शहाऐंशी',
  'सत्त्याऐंशी',
  'अठ्ठ्याऐंशी',
  'एकोणनव्वद',
  'नव्वद',
  'एक्याण्णव',
  'ब्याण्णव',
  'त्र्याण्णव',
  'चौर्याण्णव',
  'पंच्याण्णव',
  'शहाण्णव',
  'सत्त्याण्णव',
  'अठ्ठ्याण्णव',
  'नव्याण्णव',
];

function amountToMarathiWords(value: number): string {
  const amount = Math.floor(value);
  if (!Number.isFinite(amount) || amount < 0) return '';
  return `${numberToMarathiWords(amount)} रुपये फक्त`;
}

function numberToMarathiWords(value: number): string {
  if (value === 0) return 'शून्य';
  const parts: string[] = [];
  let remainder = value;
  const scales = [
    { label: 'कोटी', value: 10000000 },
    { label: 'लाख', value: 100000 },
    { label: 'हजार', value: 1000 },
  ];

  scales.forEach((scale) => {
    const count = Math.floor(remainder / scale.value);
    if (count > 0) {
      parts.push(`${numberBelowThousandMarathi(count)} ${scale.label}`);
      remainder %= scale.value;
    }
  });

  if (remainder > 0) {
    parts.push(numberBelowThousandMarathi(remainder));
  }

  return parts.join(' ');
}

function numberBelowThousandMarathi(value: number): string {
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const parts: string[] = [];

  if (hundreds > 0) {
    parts.push(hundreds === 1 ? 'शंभर' : `${MARATHI_NUMBER_BELOW_HUNDRED[hundreds]}शे`);
  }

  if (remainder > 0) {
    parts.push(MARATHI_NUMBER_BELOW_HUNDRED[remainder]);
  }

  return parts.join(' ');
}
