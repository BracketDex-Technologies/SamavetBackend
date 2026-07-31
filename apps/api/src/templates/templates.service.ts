import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomFieldType, TemplateStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { slugify } from '../common/utils/slugify';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { CreateSlipTemplateDto } from './dto/create-slip-template.dto';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { SaveTemplateConfigDto } from './dto/save-template-config.dto';
import { UploadTemplateAssetDto } from './dto/upload-template-asset.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

const systemTemplateFields = new Set([
  'slipNumber',
  'contributorName',
  'contributorNameMr',
  'contributorPhone',
  'contributorAddress',
  'shopName',
  'amount',
  'amountWords',
  'amountWordsMarathi',
  'paymentMode',
  'areaName',
  'building_name',
  'collectorName',
  'createdAt',
  'donorType',
]);

type JsonWriteValue = never;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async createCustomField(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    dto: CreateCustomFieldDto,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureFestival(mandalId, festivalId);

    const key = dto.key
      ? slugify(dto.key).replaceAll('-', '_')
      : slugify(dto.label).replaceAll('-', '_');
    if (!key) {
      throw new BadRequestException('Custom field key could not be generated.');
    }

    if (dto.type === CustomFieldType.DROPDOWN && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('Dropdown fields require at least one option.');
    }

    try {
      const field = await this.prisma.customField.create({
        data: {
          dashboardFilter: dto.dashboardFilter,
          festivalId,
          key,
          label: dto.label,
          mandalId,
          options: dto.options ? toJsonWriteValue(dto.options) : undefined,
          printOnSlip: dto.printOnSlip,
          required: dto.required,
          sortOrder: dto.sortOrder,
          type: dto.type,
        },
      });

      await this.audit(ctx, mandalId, 'custom_field', field.id, 'created', undefined, field);
      return field;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Custom field key already exists for this festival.');
      }

      throw error;
    }
  }

  async listCustomFields(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.customField.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      where: { festivalId, mandalId },
    });
  }

  async updateCustomField(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    fieldId: string,
    dto: UpdateCustomFieldDto,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureFestival(mandalId, festivalId);

    const before = await this.prisma.customField.findFirst({
      where: { festivalId, id: fieldId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Custom field not found.');
    }

    const nextType = dto.type ?? before.type;
    const nextOptions =
      dto.options?.map((option) => String(option).trim()).filter(Boolean) ??
      ((before.options as string[] | null) ?? undefined);

    if (nextType === CustomFieldType.DROPDOWN && (!nextOptions || nextOptions.length === 0)) {
      throw new BadRequestException('Dropdown fields require at least one option.');
    }

    const after = await this.prisma.customField.update({
      data: {
        dashboardFilter: dto.dashboardFilter,
        label: dto.label?.trim(),
        options: dto.options ? toJsonWriteValue(nextOptions) : undefined,
        printOnSlip: dto.printOnSlip,
        required: dto.required,
        sortOrder: dto.sortOrder,
        type: dto.type,
      },
      where: { id: fieldId },
    });

    await this.audit(ctx, mandalId, 'custom_field', fieldId, 'updated', before, after);
    return after;
  }

  async deleteCustomField(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    fieldId: string,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureFestival(mandalId, festivalId);

    const before = await this.prisma.customField.findFirst({
      where: { festivalId, id: fieldId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Custom field not found.');
    }

    await this.prisma.customField.delete({ where: { id: fieldId } });
    await this.audit(ctx, mandalId, 'custom_field', fieldId, 'deleted', before, undefined);

    return { deleted: true, id: fieldId };
  }

  async createTemplate(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    dto: CreateSlipTemplateDto,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureFestival(mandalId, festivalId);

    const template = await this.prisma.slipTemplate.create({
      data: {
        createdBy: ctx.userId,
        festivalId,
        mandalId,
        name: dto.name,
        status: TemplateStatus.DRAFT,
      },
    });

    await this.audit(ctx, mandalId, 'slip_template', template.id, 'created', undefined, template);
    return template;
  }

  async listTemplates(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.slipTemplate.findMany({
      include: {
        versions: {
          orderBy: { version: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      where: { festivalId, mandalId },
    });
  }

  async uploadTemplateAsset(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    dto: UploadTemplateAssetDto,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureFestival(mandalId, festivalId);

    const asset = await this.storageService.uploadDataUrl({
      dataUrl: dto.dataUrl,
      fileName: dto.fileName,
      folder: `mandals/${mandalId}/festivals/${festivalId}/templates`,
    });

    await Promise.all([
      this.audit(ctx, mandalId, 'template_asset', asset.key ?? asset.url, 'uploaded', undefined, {
        bucket: asset.bucket,
        key: asset.key,
        storage: asset.storage,
        url: asset.url,
      }),
      this.jobsService.enqueue({
        mandalId,
        payload: {
          bucket: asset.bucket,
          festivalId,
          key: asset.key,
          storage: asset.storage,
        },
        type: 'TEMPLATE_ASSET_AUDIT',
      }),
    ]);

    return asset;
  }

  async saveActiveTemplateVersion(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    dto: SaveTemplateConfigDto,
  ) {
    assertSameMandal(ctx, mandalId);
    await Promise.all([
      this.ensureFestival(mandalId, festivalId),
      this.validateRenderConfig(mandalId, festivalId, dto.renderConfig),
    ]);

    return this.prisma.$transaction(async (tx) => {
      const template =
        (await tx.slipTemplate.findFirst({
          orderBy: { createdAt: 'asc' },
          where: { festivalId, mandalId },
        })) ??
        (await tx.slipTemplate.create({
          data: {
            createdBy: ctx.userId,
            festivalId,
            mandalId,
            name: dto.name?.trim() || 'Vargani Receipt Template',
            status: TemplateStatus.DRAFT,
          },
        }));

      const latest = await tx.slipTemplateVersion.aggregate({
        _max: { version: true },
        where: { templateId: template.id },
      });
      const versionNumber = (latest._max.version ?? 0) + 1;

      await tx.slipTemplateVersion.updateMany({
        data: { isActive: false },
        where: { templateId: template.id, isActive: true },
      });

      const activeVersion = await tx.slipTemplateVersion.create({
        data: {
          backgroundFileUrl: dto.backgroundFileUrl,
          canvasHeight: dto.canvasHeight,
          canvasWidth: dto.canvasWidth,
          isActive: true,
          renderConfig: toJsonWriteValue(dto.renderConfig),
          templateId: template.id,
          version: versionNumber,
        },
      });

      const activeTemplate = await tx.slipTemplate.update({
        data: {
          name: dto.name?.trim() || template.name,
          status: TemplateStatus.ACTIVE,
        },
        where: { id: template.id },
      });

      await tx.festival.update({
        data: { activeTemplateVersionId: activeVersion.id },
        where: { id: festivalId },
      });

      await tx.auditEvent.create({
        data: {
          action: 'saved_active_version',
          actorUserId: ctx.userId,
          after: toJsonWriteValue(activeVersion),
          entityId: activeVersion.id,
          entityType: 'slip_template_version',
          mandalId,
          metadata: toJsonWriteValue({
            templateId: activeTemplate.id,
            version: activeVersion.version,
          }),
        },
      });

      return {
        template: activeTemplate,
        version: activeVersion,
      };
    });
  }

  async createTemplateVersion(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    templateId: string,
    dto: CreateTemplateVersionDto,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureTemplate(mandalId, festivalId, templateId);
    await this.validateRenderConfig(mandalId, festivalId, dto.renderConfig);

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.slipTemplateVersion.aggregate({
        _max: { version: true },
        where: { templateId },
      });
      const versionNumber = (latest._max.version ?? 0) + 1;

      const version = await tx.slipTemplateVersion.create({
        data: {
          backgroundFileUrl: dto.backgroundFileUrl,
          canvasHeight: dto.canvasHeight,
          canvasWidth: dto.canvasWidth,
          renderConfig: toJsonWriteValue(dto.renderConfig),
          templateId,
          version: versionNumber,
        },
      });

      await tx.auditEvent.create({
        data: {
          action: 'created',
          actorUserId: ctx.userId,
          after: toJsonWriteValue(version),
          entityId: version.id,
          entityType: 'slip_template_version',
          mandalId,
        },
      });

      return version;
    });
  }

  async activateTemplateVersion(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    templateId: string,
    versionId: string,
  ) {
    assertSameMandal(ctx, mandalId);
    await this.ensureTemplate(mandalId, festivalId, templateId);

    const version = await this.prisma.slipTemplateVersion.findFirst({
      where: { id: versionId, templateId },
    });

    if (!version) {
      throw new NotFoundException('Template version not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.slipTemplateVersion.updateMany({
        data: { isActive: false },
        where: { templateId },
      });

      const activeVersion = await tx.slipTemplateVersion.update({
        data: { isActive: true },
        where: { id: versionId },
      });

      await tx.slipTemplate.update({
        data: { status: TemplateStatus.ACTIVE },
        where: { id: templateId },
      });

      await tx.festival.update({
        data: { activeTemplateVersionId: versionId },
        where: { id: festivalId },
      });

      await tx.auditEvent.create({
        data: {
          action: 'activated',
          actorUserId: ctx.userId,
          after: toJsonWriteValue(activeVersion),
          entityId: versionId,
          entityType: 'slip_template_version',
          mandalId,
        },
      });

      return activeVersion;
    });
  }

  private async ensureFestival(mandalId: string, festivalId: string) {
    const festival = await this.prisma.festival.findFirst({
      where: { id: festivalId, mandalId },
    });

    if (!festival) {
      throw new NotFoundException('Festival not found.');
    }

    return festival;
  }

  private async ensureTemplate(mandalId: string, festivalId: string, templateId: string) {
    const template = await this.prisma.slipTemplate.findFirst({
      where: { festivalId, id: templateId, mandalId },
    });

    if (!template) {
      throw new NotFoundException('Template not found.');
    }

    return template;
  }

  private async validateRenderConfig(
    mandalId: string,
    festivalId: string,
    renderConfig: Record<string, unknown>,
  ) {
    const fields = renderConfig.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new BadRequestException('renderConfig.fields is required.');
    }

    const customFields = await this.prisma.customField.findMany({
      select: { key: true },
      where: { festivalId, mandalId },
    });
    const allowedKeys = new Set([
      ...systemTemplateFields,
      ...customFields.map((field) => field.key),
    ]);

    for (const key of Object.keys(fields)) {
      const baseKey = baseTemplateFieldKey(key);
      if (!allowedKeys.has(baseKey)) {
        throw new BadRequestException(`Unknown template field binding: ${key}.`);
      }
    }
  }

  private async audit(
    ctx: AuthContext,
    mandalId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        action,
        actorUserId: ctx.userId,
        after: toJsonWriteValue(after),
        before: toJsonWriteValue(before),
        entityId,
        entityType,
        mandalId,
      },
    });
  }
}

function baseTemplateFieldKey(key: string): string {
  return key.replace(/_copy_\d+$/, '');
}

function toJsonWriteValue(value: unknown): JsonWriteValue {
  return value as JsonWriteValue;
}
