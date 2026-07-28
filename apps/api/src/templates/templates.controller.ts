import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { CreateSlipTemplateDto } from './dto/create-slip-template.dto';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { SaveTemplateConfigDto } from './dto/save-template-config.dto';
import { TemplatesService } from './templates.service';
import { UploadTemplateAssetDto } from './dto/upload-template-asset.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/festivals/:festivalId')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post('custom-fields')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  createCustomField(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.templatesService.createCustomField(ctx, mandalId, festivalId, dto);
  }

  @Get('custom-fields')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  listCustomFields(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
  ) {
    return this.templatesService.listCustomFields(ctx, mandalId, festivalId);
  }

  @Patch('custom-fields/:fieldId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  updateCustomField(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.templatesService.updateCustomField(ctx, mandalId, festivalId, fieldId, dto);
  }

  @Delete('custom-fields/:fieldId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  deleteCustomField(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.templatesService.deleteCustomField(ctx, mandalId, festivalId, fieldId);
  }

  @Post('templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  createTemplate(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: CreateSlipTemplateDto,
  ) {
    return this.templatesService.createTemplate(ctx, mandalId, festivalId, dto);
  }

  @Get('templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  listTemplates(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
  ) {
    return this.templatesService.listTemplates(ctx, mandalId, festivalId);
  }

  @Post('templates/assets')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  uploadTemplateAsset(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: UploadTemplateAssetDto,
  ) {
    return this.templatesService.uploadTemplateAsset(ctx, mandalId, festivalId, dto);
  }

  @Put('templates/active-version')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  saveActiveTemplateVersion(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: SaveTemplateConfigDto,
  ) {
    return this.templatesService.saveActiveTemplateVersion(ctx, mandalId, festivalId, dto);
  }

  @Post('templates/:templateId/versions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  createTemplateVersion(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('templateId') templateId: string,
    @Body() dto: CreateTemplateVersionDto,
  ) {
    return this.templatesService.createTemplateVersion(ctx, mandalId, festivalId, templateId, dto);
  }

  @Patch('templates/:templateId/versions/:versionId/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  activateTemplateVersion(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.templatesService.activateTemplateVersion(
      ctx,
      mandalId,
      festivalId,
      templateId,
      versionId,
    );
  }
}
