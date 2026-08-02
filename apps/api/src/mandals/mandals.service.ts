import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WhatsAppReceiptService } from '../vargani/whatsapp-receipt.service';
import { CreateMandalDto } from './dto/create-mandal.dto';
import { CreateMandalUserDto } from './dto/create-mandal-user.dto';
import { ListMandalsQueryDto } from './dto/list-mandals-query.dto';
import { DEFAULT_TEMPLATE_BACKGROUND_URL, ensureDefaultMandalWorkspace } from './mandal-defaults';
import { UpdateMandalUserDto } from './dto/update-mandal-user.dto';
import { UpdateMandalDto } from './dto/update-mandal.dto';
import { UpdateMandalStatusDto } from './dto/update-mandal-status.dto';

type JsonWriteValue = never;

const ownerCreatableRoles = new Set<UserRole>([
  UserRole.MANDAL_ADMIN,
  UserRole.KHAJINDAR,
  UserRole.GROUP_LEADER,
  UserRole.MEMBER,
]);

interface MandalListWhere {
  OR?: Array<{
    city?: { contains: string; mode: 'insensitive' };
    locality?: { contains: string; mode: 'insensitive' };
    name?: { contains: string; mode: 'insensitive' };
    nameMr?: { contains: string; mode: 'insensitive' };
    slug?: { contains: string; mode: 'insensitive' };
  }>;
  status?: AccountStatus;
}

@Injectable()
export class MandalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly whatsAppReceiptService: WhatsAppReceiptService,
  ) {}

  async listWhatsAppTemplates(forceRefresh = false) {
    try {
      return await this.whatsAppReceiptService.listTemplates(forceRefresh);
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Could not load Authkey WhatsApp templates.',
      );
    }
  }

  async create(dto: CreateMandalDto) {
    const slug = dto.slug ?? slugify(dto.name);

    if (!slug) {
      throw new ConflictException('Mandal slug could not be generated.');
    }

    const existingMandal = await this.prisma.mandal.findUnique({ where: { slug } });

    if (existingMandal) {
      throw new ConflictException('Mandal slug already exists.');
    }

    const adminUniqueChecks = [
      { email: dto.admin.email.toLowerCase() },
      dto.admin.phone ? { phone: dto.admin.phone } : null,
    ].filter(Boolean) as Array<{ email?: string; phone?: string }>;

    const existingAdmin = await this.prisma.user.findFirst({
      include: { memberProfiles: { select: { status: true } } },
      where: {
        OR: adminUniqueChecks,
      },
    });

    if (existingAdmin && !this.canReclaimLogin(existingAdmin)) {
      throw new ConflictException('Admin email or phone is already used.');
    }

    if (existingAdmin) {
      await this.prisma.$transaction((tx) => this.hardDeleteUser(tx, {
        mandalId: existingAdmin.mandalId,
        userId: existingAdmin.id,
      }));
    }

    const logoAsset = dto.logoDataUrl
      ? await this.storageService.uploadDataUrl({
          dataUrl: dto.logoDataUrl,
          fileName: `${slug}-logo`,
          folder: `mandals/${slug}/logo`,
        })
      : null;
    const templateBackgroundUrl = dto.defaultTemplateUrl ?? DEFAULT_TEMPLATE_BACKGROUND_URL;
    const adminPasswordHash = await argon2.hash(dto.admin.password);

    return this.prisma.$transaction(async (tx) => {
      const mandal = await tx.mandal.create({
        data: {
          address: dto.address,
          city: dto.city,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          logoUrl: logoAsset?.url,
          locality: dto.locality,
          name: dto.name,
          nameMr: dto.nameMr?.trim() || null,
          plan: dto.plan ?? 'starter',
          slipLimit: dto.slipLimit,
          slug,
          state: dto.state,
          status: AccountStatus.ACTIVE,
          whatsappMode: dto.whatsappMode ?? 'AUTO_API',
        },
      });

      const admin = await tx.user.create({
        data: {
          email: dto.admin.email.toLowerCase(),
          mandalId: mandal.id,
          name: dto.admin.name,
          passwordHash: adminPasswordHash,
          phone: dto.admin.phone,
          role: UserRole.MANDAL_ADMIN,
          status: AccountStatus.ACTIVE,
        },
      });

      const { activeFestival, template, templateVersion } = await ensureDefaultMandalWorkspace(tx, {
        createdByUserId: admin.id,
        mandalId: mandal.id,
        templateBackgroundUrl,
      });

      await tx.auditEvent.create({
        data: {
          action: 'created',
          after: this.toJson({
            adminUserId: admin.id,
            festivalId: activeFestival.id,
            mandalId: mandal.id,
            templateVersionId: templateVersion.id,
          }),
          entityId: mandal.id,
          entityType: 'mandal',
          mandalId: mandal.id,
        },
      });

      return {
        admin: this.serializeAdmin(admin),
        mandal: {
          ...mandal,
          festivals: [
            {
              ...activeFestival,
              templates: [
                {
                  ...template,
                  versions: [templateVersion],
                },
              ],
            },
          ],
        },
      };
    }, { timeout: 15000 });
  }

  async list(query: ListMandalsQueryDto) {
    const where: MandalListWhere = {
      status: query.status ?? AccountStatus.ACTIVE,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { nameMr: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { locality: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mandal.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        where,
      }),
      this.prisma.mandal.count({ where }),
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

  async getById(id: string) {
    const mandal = await this.prisma.mandal.findFirst({
      include: {
        users: {
          select: {
            createdAt: true,
            email: true,
            id: true,
            name: true,
            phone: true,
            role: true,
            status: true,
          },
          where: {
            role: UserRole.MANDAL_ADMIN,
            status: AccountStatus.ACTIVE,
          },
        },
        _count: {
          select: {
            festivals: true,
            members: { where: { status: AccountStatus.ACTIVE, user: { status: AccountStatus.ACTIVE } } },
            slips: true,
          },
        },
      },
      where: { id, status: AccountStatus.ACTIVE },
    });

    if (!mandal) {
      throw new NotFoundException('Mandal not found.');
    }

    return mandal;
  }

  async listUsers(id: string) {
    await this.ensureMandalExists(id);

    return this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        createdAt: true,
        email: true,
        id: true,
        lastLoginAt: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
      where: {
        mandalId: id,
        status: AccountStatus.ACTIVE,
        OR: [
          { role: { notIn: [UserRole.MEMBER, UserRole.GROUP_LEADER] } },
          { memberProfiles: { some: { status: AccountStatus.ACTIVE } } },
          { memberProfiles: { none: {} } },
        ],
      },
    });
  }

  async createUser(id: string, dto: CreateMandalUserDto) {
    if (!ownerCreatableRoles.has(dto.role)) {
      throw new BadRequestException('Role cannot be created for a mandal account.');
    }

    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Either email or phone is required for login.');
    }

    await this.ensureMandalExists(id);

    const uniqueChecks = [
      dto.email ? { email: dto.email.toLowerCase() } : null,
      dto.phone ? { phone: dto.phone } : null,
    ].filter(Boolean) as Array<{ email?: string; phone?: string }>;

    const existingUser = await this.prisma.user.findFirst({
      include: { memberProfiles: { select: { status: true } } },
      where: { OR: uniqueChecks },
    });

    if (existingUser && !this.canReclaimLogin(existingUser)) {
      throw new ConflictException('User email or phone is already used.');
    }

    if (existingUser) {
      await this.prisma.$transaction((tx) => this.hardDeleteUser(tx, {
        mandalId: existingUser.mandalId,
        userId: existingUser.id,
      }));
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email?.toLowerCase(),
        mandalId: id,
        name: dto.name,
        passwordHash: await argon2.hash(dto.password),
        phone: dto.phone,
        role: dto.role,
        status: AccountStatus.ACTIVE,
      },
      select: {
        createdAt: true,
        email: true,
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        action: 'user_created',
        after: this.toJson({ role: user.role, userId: user.id }),
        entityId: user.id,
        entityType: 'user',
        mandalId: id,
      },
    });

    return user;
  }

  async updateStatus(id: string, dto: UpdateMandalStatusDto) {
    const mandal = await this.prisma.mandal.findUnique({ where: { id } });

    if (!mandal) {
      throw new NotFoundException('Mandal not found.');
    }

    const updated = await this.prisma.mandal.update({
      data: { status: dto.status },
      where: { id },
    });

    await this.prisma.auditEvent.create({
      data: {
        action: 'status_updated',
        after: this.toJson({ status: updated.status }),
        before: this.toJson({ status: mandal.status }),
        entityId: id,
        entityType: 'mandal',
        mandalId: id,
      },
    });

    return updated;
  }

  async updateMandal(id: string, dto: UpdateMandalDto) {
    const before = await this.ensureMandalExists(id);
    const logoAsset = dto.logoDataUrl
      ? await this.storageService.uploadDataUrl({
          dataUrl: dto.logoDataUrl,
          fileName: `${before.id}-logo`,
          folder: `mandals/${before.id}/logo`,
        })
      : null;

    let whatsappTemplateUpdate: {
      whatsappTemplateLanguage: string | null;
      whatsappTemplateName: string | null;
      whatsappTemplateVariableCount: number | null;
      whatsappTemplateWid: string | null;
    } | undefined;

    if (dto.whatsappTemplateWid !== undefined) {
      const requestedWid = dto.whatsappTemplateWid?.trim() || null;
      if (!requestedWid) {
        whatsappTemplateUpdate = {
          whatsappTemplateLanguage: null,
          whatsappTemplateName: null,
          whatsappTemplateVariableCount: null,
          whatsappTemplateWid: null,
        };
      } else {
        let catalog;
        try {
          catalog = await this.whatsAppReceiptService.listTemplates();
        } catch (error) {
          throw new ServiceUnavailableException(
            error instanceof Error ? error.message : 'Could not validate the Authkey template.',
          );
        }

        const template = catalog.items.find((item) => item.wid === requestedWid);
        if (!template) throw new BadRequestException('The selected Authkey WhatsApp template was not found.');
        if (!template.approved) throw new BadRequestException('Only approved Authkey WhatsApp templates can be assigned.');
        if (!template.compatible) {
          throw new BadRequestException('The selected template uses unsupported WhatsApp body variables.');
        }

        whatsappTemplateUpdate = {
          whatsappTemplateLanguage: template.language,
          whatsappTemplateName: template.name,
          whatsappTemplateVariableCount: template.variableCount,
          whatsappTemplateWid: template.wid,
        };
      }
    }

    const updated = await this.prisma.mandal.update({
      data: {
        address: dto.address,
        city: dto.city,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        locality: dto.locality,
        logoUrl: logoAsset?.url,
        name: dto.name,
        nameMr: dto.nameMr,
        plan: dto.plan,
        slipLimit: dto.slipLimit,
        state: dto.state,
        whatsappMode: dto.whatsappMode,
        ...whatsappTemplateUpdate,
      },
      where: { id },
    });

    await this.prisma.auditEvent.create({
      data: {
        action: 'mandal_updated',
        after: this.toJson(updated),
        before: this.toJson(before),
        entityId: id,
        entityType: 'mandal',
        mandalId: id,
      },
    });

    return updated;
  }

  async deleteMandal(id: string) {
    const mandal = await this.prisma.mandal.findUnique({ where: { id } });

    if (!mandal) {
      throw new NotFoundException('Mandal not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.deleteMany({
        where: { user: { mandalId: id } },
      });

      await tx.auditEvent.deleteMany({
        where: { mandalId: id },
      });

      await tx.backgroundJob.deleteMany({
        where: { mandalId: id },
      });

      await tx.varganiSlip.deleteMany({
        where: { mandalId: id },
      });

      await tx.expense.deleteMany({
        where: { mandalId: id },
      });

      await tx.expenseCategory.deleteMany({
        where: { mandalId: id },
      });

      await tx.festivalTask.deleteMany({
        where: { mandalId: id },
      });

      await tx.festival.updateMany({
        data: { activeTemplateVersionId: null },
        where: { mandalId: id },
      });

      await tx.member.deleteMany({
        where: { mandalId: id },
      });

      await tx.memberGroup.deleteMany({
        where: { mandalId: id },
      });

      await tx.customField.deleteMany({
        where: { mandalId: id },
      });

      await tx.slipTemplateVersion.deleteMany({
        where: { template: { mandalId: id } },
      });

      await tx.slipTemplate.deleteMany({
        where: { mandalId: id },
      });

      await tx.slipSequence.deleteMany({
        where: { mandalId: id },
      });

      await tx.festival.deleteMany({
        where: { mandalId: id },
      });

      await tx.user.deleteMany({
        where: { mandalId: id },
      });

      await tx.mandal.delete({
        where: { id },
      });
    });

    return { deleted: true, id };
  }

  async updateUser(mandalId: string, userId: string, dto: UpdateMandalUserDto) {
    await this.ensureMandalExists(mandalId);

    if (dto.role && !ownerCreatableRoles.has(dto.role)) {
      throw new BadRequestException('Role cannot be assigned for a mandal account.');
    }

    const before = await this.prisma.user.findFirst({ where: { id: userId, mandalId } });

    if (!before) {
      throw new NotFoundException('User not found.');
    }

    const uniqueChecks = [
      dto.email ? { email: dto.email.toLowerCase(), id: { not: userId } } : null,
      dto.phone ? { phone: dto.phone, id: { not: userId } } : null,
    ].filter(Boolean) as Array<{
      email?: string;
      id: { not: string };
      phone?: string;
    }>;

    if (uniqueChecks.length) {
      const existingUser = await this.prisma.user.findFirst({ where: { OR: uniqueChecks } });

      if (existingUser) {
        throw new ConflictException('User email or phone is already used.');
      }
    }

    const updated = await this.prisma.user.update({
      data: {
        email: dto.email?.toLowerCase(),
        name: dto.name,
        passwordHash: dto.password ? await argon2.hash(dto.password) : undefined,
        phone: dto.phone,
        role: dto.role,
        status: dto.status,
      },
      select: {
        createdAt: true,
        email: true,
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
      where: { id: userId },
    });

    if (dto.password) {
      await this.prisma.userSession.deleteMany({ where: { userId } });
    }

    await this.prisma.auditEvent.create({
      data: {
        action: 'user_updated',
        after: this.toJson(updated),
        before: this.toJson(before),
        entityId: userId,
        entityType: 'user',
        mandalId,
      },
    });

    return updated;
  }

  private canReclaimLogin(user: {
    memberProfiles: Array<{ status: AccountStatus }>;
    role: UserRole;
    status: AccountStatus;
  }) {
    if (user.status !== AccountStatus.ACTIVE) return true;
    const isCollectionLogin = user.role === UserRole.MEMBER || user.role === UserRole.GROUP_LEADER;
    const hasActiveMemberProfile = user.memberProfiles.some((profile) => profile.status === AccountStatus.ACTIVE);
    return isCollectionLogin && !hasActiveMemberProfile;
  }

  private async hardDeleteUser(
    tx: Prisma.TransactionClient,
    params: { mandalId?: string | null; userId: string },
  ) {
    const mandalFilter = params.mandalId ? { mandalId: params.mandalId } : {};

    await tx.memberGroup.updateMany({
      data: { leaderUserId: null },
      where: { leaderUserId: params.userId, ...mandalFilter },
    });

    await tx.festivalTask.updateMany({
      data: { assigneeUserId: null },
      where: { assigneeUserId: params.userId, ...mandalFilter },
    });

    await tx.expense.updateMany({
      data: { approvedBy: null },
      where: { approvedBy: params.userId, ...mandalFilter },
    });

    await tx.varganiSlip.deleteMany({
      where: { collectedByUserId: params.userId, ...mandalFilter },
    });

    await tx.festivalTask.deleteMany({
      where: { createdBy: params.userId, ...mandalFilter },
    });

    await tx.expense.deleteMany({
      where: { createdBy: params.userId, ...mandalFilter },
    });

    await tx.userSession.deleteMany({
      where: { userId: params.userId },
    });

    await tx.member.deleteMany({
      where: { userId: params.userId, ...mandalFilter },
    });

    await tx.user.delete({
      where: { id: params.userId },
    });
  }

  private serializeAdmin(admin: {
    createdAt: Date;
    email: string | null;
    id: string;
    name: string;
    phone: string | null;
    role: UserRole;
    status: AccountStatus;
  }) {
    return {
      createdAt: admin.createdAt,
      email: admin.email,
      id: admin.id,
      name: admin.name,
      phone: admin.phone,
      role: admin.role,
      status: admin.status,
    };
  }

  private toJson(value: unknown): JsonWriteValue {
    return value as JsonWriteValue;
  }

  private async ensureMandalExists(id: string) {
    const mandal = await this.prisma.mandal.findFirst({
      where: { id, status: AccountStatus.ACTIVE },
    });

    if (!mandal) {
      throw new NotFoundException('Mandal not found.');
    }

    return mandal;
  }
}
