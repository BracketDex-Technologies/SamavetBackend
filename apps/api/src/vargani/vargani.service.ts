import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountStatus,
  CustomFieldType,
  FestivalStatus,
  Prisma,
  RenderStatus,
  SlipStatus,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthContext } from '../auth/auth-context';
import { requireMandalId } from '../auth/tenant-scope';
import { AppConfig } from '../config/app-config';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CancelSlipDto } from './dto/cancel-slip.dto';
import { CreateVarganiSlipDto } from './dto/create-vargani-slip.dto';
import { ListVarganiSlipsQueryDto } from './dto/list-vargani-slips-query.dto';
import { ShareSlipDto } from './dto/share-slip.dto';
import { UpdateVarganiSlipDto } from './dto/update-vargani-slip.dto';
import { UploadSlipReceiptImageDto } from './dto/upload-slip-receipt-image.dto';
import { WhatsAppReceiptService, WhatsAppSendResult } from './whatsapp-receipt.service';

interface SequenceRow {
  current_value: bigint;
}

type JsonWriteValue = never;

function isCollectorRole(role: UserRole) {
  return role === UserRole.MEMBER || role === UserRole.GROUP_LEADER;
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

interface WhatsAppSlip {
  collectedByUserId: string;
  contributorName: string;
  contributorPhone: string | null;
  customData?: unknown;
  id: string;
  mandal: {
    name: string;
    nameMr?: string | null;
    whatsappTemplateVariableCount?: number | null;
    whatsappTemplateWid?: string | null;
  };
  mandalId: string;
  receiptImageUrl: string | null;
  slipNumber: string;
}

type SlipWithTemplate = Awaited<ReturnType<VarganiService['getSlip']>> & {
  templateVersion: NonNullable<Awaited<ReturnType<VarganiService['getSlip']>>['templateVersion']>;
};

@Injectable()
export class VarganiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly whatsAppReceiptService: WhatsAppReceiptService,
    private readonly storageService: StorageService,
    private readonly jobsService: JobsService,
  ) {}

  async getActiveForm(ctx: AuthContext) {
    const mandalId = requireMandalId(ctx);
    const festival = await this.getActiveFestival(mandalId);
    const [member, customFields] = await Promise.all([
      this.prisma.member.findFirst({
        include: { group: true },
        where: {
          festivalId: festival.id,
          mandalId,
          status: AccountStatus.ACTIVE,
          user: { status: AccountStatus.ACTIVE },
          userId: ctx.userId,
        },
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
    const canAssignGroup = ctx.role === UserRole.MANDAL_ADMIN || ctx.role === UserRole.KHAJINDAR;
    const [member, customFields, existing, requestedGroup] = await Promise.all([
      this.prisma.member.findFirst({
        select: { areaName: true, groupId: true },
        where: {
          festivalId: festival.id,
          mandalId,
          status: AccountStatus.ACTIVE,
          user: { status: AccountStatus.ACTIVE },
          userId: ctx.userId,
        },
      }),
      this.prisma.customField.findMany({
        select: { key: true, label: true, required: true, type: true },
        where: { festivalId: festival.id, mandalId },
      }),
      dto.idempotencyKey
        ? this.prisma.varganiSlip.findUnique({
            include: {
              collector: { select: { id: true, name: true, phone: true } },
              mandal: { select: { id: true, name: true, nameMr: true } },
            },
            where: { idempotencyKey: dto.idempotencyKey },
          })
        : Promise.resolve(null),
      dto.groupId && canAssignGroup
        ? this.prisma.memberGroup.findFirst({
            select: { id: true },
            where: { festivalId: festival.id, id: dto.groupId, mandalId },
          })
        : Promise.resolve(null),
    ]);

    if (!member && isCollectorRole(ctx.role)) {
      throw new ForbiddenException('Member is not assigned to the active festival.');
    }

    let groupId = member?.groupId ?? null;
    if (dto.groupId && canAssignGroup) {
      if (!requestedGroup) {
        throw new NotFoundException('Collection group not found.');
      }

      groupId = requestedGroup.id;
    }

    this.validateCustomData(customFields, dto.customData ?? {});

    if (existing) {
      return existing;
    }

    const slip = await this.prisma.$transaction(async (tx) => {
      const [mandalQuota] = await tx.$queryRaw<Array<{ slipLimit: number | null }>>`
        SELECT "slip_limit" AS "slipLimit" FROM mandals WHERE id = ${mandalId}::uuid FOR UPDATE
      `;
      const generatedSlipCount = mandalQuota?.slipLimit
        ? await tx.varganiSlip.count({ where: { mandalId } })
        : 0;
      if (mandalQuota?.slipLimit && generatedSlipCount >= mandalQuota.slipLimit) {
        throw new ForbiddenException(
          `Slip generation limit of ${mandalQuota.slipLimit} has been reached. Contact Super Admin to generate more slips.`,
        );
      }

      const nextValue = await this.nextSlipSequence(tx, mandalId, festival.id);
      const slipStatus = dto.status === SlipStatus.PENDING ? SlipStatus.PENDING : SlipStatus.ACTIVE;
      const slipNumber = `DM-${festival.type.slice(0, 3).toUpperCase()}-${new Date(festival.startDate).getFullYear()}-${String(nextValue).padStart(6, '0')}`;

      const slip = await tx.varganiSlip.create({
        include: {
          collector: { select: { id: true, name: true, phone: true } },
          mandal: { select: { id: true, name: true, nameMr: true } },
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

      const { collector: _collector, mandal: _mandal, ...auditSlip } = slip;
      await tx.auditEvent.create({
        data: {
          action: 'created',
          // Preserve the full scalar audit snapshot while avoiding duplicated
          // mandal and collector relationship objects on every high-volume row.
          after: toJsonWriteValue(auditSlip),
          actorUserId: ctx.userId,
          entityId: slip.id,
          entityType: 'vargani_slip',
          mandalId,
        },
      });

      return slip;
    }).catch(async (error: unknown) => {
      if (dto.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentSlip = await this.prisma.varganiSlip.findUnique({
          include: {
            collector: { select: { id: true, name: true, phone: true } },
            mandal: { select: { id: true, name: true, nameMr: true } },
          },
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (concurrentSlip) {
          return concurrentSlip;
        }
      }
      throw error;
    });

    return slip;
  }

  async listSlips(ctx: AuthContext, query: ListVarganiSlipsQueryDto) {
    const mandalId = requireMandalId(ctx);
    const festival = await this.getActiveFestival(mandalId);
    const skip = (query.page - 1) * query.limit;
    const selectedDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : undefined;
    const where: Prisma.VarganiSlipWhereInput = {
      festivalId: festival.id,
      mandalId,
      collectedByUserId: query.createdByUserId,
      createdAt: selectedDate
        ? { gte: selectedDate, lt: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000) }
        : undefined,
      status: query.status,
      OR: query.search?.trim()
        ? [
            { slipNumber: { contains: query.search.trim(), mode: 'insensitive' } },
            { contributorName: { contains: query.search.trim(), mode: 'insensitive' } },
            { shopName: { contains: query.search.trim(), mode: 'insensitive' } },
            { contributorAddress: { contains: query.search.trim(), mode: 'insensitive' } },
            { areaName: { contains: query.search.trim(), mode: 'insensitive' } },
            { collector: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
          ]
        : undefined,
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
        mandal: {
          select: {
            id: true,
            name: true,
            nameMr: true,
            whatsappMode: true,
            whatsappTemplateVariableCount: true,
            whatsappTemplateWid: true,
          },
        },
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

  async uploadReceiptImage(ctx: AuthContext, id: string, dto: UploadSlipReceiptImageDto) {
    const slip = await this.getSlip(ctx, id);
    if (slip.status !== SlipStatus.ACTIVE) {
      throw new BadRequestException('Receipt image can be uploaded only after payment is received.');
    }

    const asset = await this.storageService.uploadDataUrl({
      dataUrl: dto.dataUrl,
      fileName: `${slip.slipNumber || slip.id}.jpg`,
      folder: `mandals/${slip.mandalId}/festivals/${slip.festivalId}/receipts`,
      private: true,
    });

    const updated = await this.prisma.varganiSlip.update({
      data: {
        receiptImageUrl: asset.url,
        renderStatus: RenderStatus.READY,
      },
      where: { id: slip.id },
    });

    await this.prisma.auditEvent.create({
      data: {
        action: 'receipt_image_uploaded',
        actorUserId: ctx.userId,
        entityId: slip.id,
        entityType: 'vargani_slip',
        mandalId: slip.mandalId,
        metadata: toJsonWriteValue({
          receiptImageUrl: asset.url,
          slipNumber: slip.slipNumber,
          storage: asset.storage,
        }),
      },
    });

    return {
      ok: true,
      receiptImageUrl: await this.storageService.resolveUrl(updated.receiptImageUrl),
      storage: asset.storage,
    };
  }

  async uploadReceiptImageFile(
    ctx: AuthContext,
    id: string,
    file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) throw new BadRequestException('Receipt image file is required.');
    const slip = await this.getSlip(ctx, id);
    if (slip.status !== SlipStatus.ACTIVE) {
      throw new BadRequestException('Receipt image can be uploaded only after payment is received.');
    }

    const asset = await this.storageService.uploadBuffer({
      body: file.buffer,
      contentType: file.mimetype,
      fileName: file.originalname || `${slip.slipNumber || slip.id}.jpg`,
      folder: `mandals/${slip.mandalId}/festivals/${slip.festivalId}/receipts`,
      private: true,
    });
    const updated = await this.prisma.varganiSlip.update({
      data: { receiptImageUrl: asset.url, renderStatus: RenderStatus.READY },
      where: { id: slip.id },
    });
    await this.prisma.auditEvent.create({
      data: {
        action: 'receipt_image_uploaded',
        actorUserId: ctx.userId,
        entityId: slip.id,
        entityType: 'vargani_slip',
        mandalId: slip.mandalId,
        metadata: toJsonWriteValue({
          receiptImageUrl: asset.url,
          slipNumber: slip.slipNumber,
          storage: asset.storage,
          transport: 'multipart',
        }),
      },
    });
    return {
      ok: true,
      receiptImageUrl: await this.storageService.resolveUrl(updated.receiptImageUrl),
      storage: asset.storage,
    };
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

    if (slip.mandal.whatsappMode === 'MANUAL_SHARE') {
      return {
        auditEventId: event.id,
        expiresAt: shareTokenExpiresAt,
        ok: true,
        receiptUrl,
        sharedAt: event.createdAt,
        whatsapp: { ok: true, reason: 'manual_share', status: 'skipped', receiptUrl },
      };
    }

    // Until a durable queue is configured, await delivery. Fire-and-forget work
    // is not reliable on serverless runtimes and can disappear after response.
    const whatsapp = await this.sendSlipToWhatsApp(slip, dto.phone, receiptUrl);
    if (whatsapp.status === 'failed') {
      await this.jobsService.enqueue({
        deduplicationKey: `whatsapp-receipt:${event.id}`,
        mandalId: slip.mandalId,
        payload: {
          phone: dto.phone?.trim() || slip.contributorPhone || null,
          receiptUrl,
          slipId: slip.id,
        },
        runAfter: new Date(Date.now() + 60_000),
        type: 'SEND_WHATSAPP_RECEIPT',
      });
    }

    return {
      auditEventId: event.id,
      expiresAt: shareTokenExpiresAt,
      ok: true,
      receiptUrl,
      sharedAt: event.createdAt,
      whatsapp,
    };
  }

  async renderPublicReceiptHtmlByToken(token: string) {
    const tokenHash = hashShareToken(token);
    const slip = await this.prisma.varganiSlip.findFirst({
      include: {
        collector: { select: { id: true, name: true, phone: true } },
        festival: true,
        group: true,
        mandal: {
          select: {
            id: true,
            name: true,
            nameMr: true,
            whatsappMode: true,
            whatsappTemplateVariableCount: true,
            whatsappTemplateWid: true,
          },
        },
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

  async processWhatsAppRetry(payload: Record<string, unknown>) {
    const slipId = readString(payload.slipId);
    const receiptUrl = readString(payload.receiptUrl);
    if (!slipId || !receiptUrl) throw new Error('Invalid WhatsApp retry payload.');

    const slip = await this.prisma.varganiSlip.findUnique({
      include: {
        mandal: {
          select: {
            name: true,
            nameMr: true,
            whatsappTemplateVariableCount: true,
            whatsappTemplateWid: true,
          },
        },
      },
      where: { id: slipId },
    });
    if (!slip || slip.status !== SlipStatus.ACTIVE) {
      throw new Error('WhatsApp retry slip is unavailable.');
    }

    const result = await this.sendSlipToWhatsApp(slip, readString(payload.phone), receiptUrl);
    if (result.status === 'failed') {
      throw new Error(`WhatsApp provider rejected retry: ${result.reason ?? 'unknown'}`);
    }
    return result;
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
        mandal: {
          select: {
            id: true,
            name: true,
            nameMr: true,
            whatsappMode: true,
            whatsappTemplateVariableCount: true,
            whatsappTemplateWid: true,
          },
        },
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

  private async createPublicReceiptShare(slipId: string) {
    const shareToken = randomBytes(32).toString('base64url');
    const shareTokenHash = hashShareToken(shareToken);
    const shareTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const receiptUrl = this.publicReceiptUrl(shareToken);

    await this.prisma.varganiSlip.update({
      data: {
        publicShareTokenExpiresAt: shareTokenExpiresAt,
        publicShareTokenHash: shareTokenHash,
      },
      where: { id: slipId },
    });

    return { expiresAt: shareTokenExpiresAt, receiptUrl };
  }

  private async shareSlipToWhatsApp(slip: WhatsAppSlip, preferredPhone?: string | null) {
    const share = await this.createPublicReceiptShare(slip.id);
    return this.sendSlipToWhatsApp(slip, preferredPhone, share.receiptUrl);
  }

  private async sendSlipToWhatsApp(
    slip: WhatsAppSlip,
    preferredPhone: string | null | undefined,
    receiptUrl: string,
  ): Promise<WhatsAppSendResult> {
    const customData = objectFromJson(slip.customData);
    const mandalName =
      readString(customData.mandalNameMr) ||
      readString(customData.organizationNameMr) ||
      readString(slip.mandal.nameMr) ||
      knownMandalMarathiName(slip.mandal.name) ||
      slip.mandal.name;
    const contributorName =
      readString(customData.contributorNameMr) ||
      readString(customData.nameMr) ||
      slip.contributorName;

    const result = await this.whatsAppReceiptService.sendReceipt({
      contributorName,
      mandalName,
      mediaUrl: await this.storageService.resolveUrl(slip.receiptImageUrl, 60 * 60 * 24),
      organizationName: mandalName,
      phone: preferredPhone || slip.contributorPhone,
      receiptUrl,
      slipNumber: slip.slipNumber,
      templateVariableCount: slip.mandal.whatsappTemplateVariableCount,
      templateWid: slip.mandal.whatsappTemplateWid,
    });

    await this.prisma.auditEvent.create({
      data: {
        action: result.status === 'sent' ? 'whatsapp_sent' : `whatsapp_${result.status}`,
        actorUserId: slip.collectedByUserId,
        entityId: slip.id,
        entityType: 'vargani_slip',
        mandalId: slip.mandalId,
        metadata: toJsonWriteValue({
          phone: preferredPhone || slip.contributorPhone || null,
          reason: result.reason ?? null,
          receiptUrl,
          slipNumber: slip.slipNumber,
          status: result.status,
          templateWid: result.templateWid ?? null,
        }),
      },
    });

    return { ...result, receiptUrl };
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
      contributorAddress: readString(customData.contributorAddressMr) || slip.contributorAddress || '',
      contributorAddressMr: readString(customData.contributorAddressMr) || slip.contributorAddress || '',
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
      $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
    },
    mandalId: string,
    festivalId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<SequenceRow[]>`
      INSERT INTO "slip_sequences" ("id", "mandal_id", "festival_id", "current_value", "updated_at")
      VALUES (${randomUUID()}::uuid, ${mandalId}::uuid, ${festivalId}::uuid, 1, now())
      ON CONFLICT ("mandal_id", "festival_id")
      DO UPDATE SET "current_value" = "slip_sequences"."current_value" + 1, "updated_at" = now()
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

function objectFromJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function knownMandalMarathiName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized === 'bajirao road natubag mandal trust') {
    return 'बाजीराव रोड नतुबग मंडळ ट्रस्ट';
  }

  return '';
}
