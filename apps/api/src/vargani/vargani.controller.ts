import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CancelSlipDto } from './dto/cancel-slip.dto';
import { CreateVarganiSlipDto } from './dto/create-vargani-slip.dto';
import { ShareSlipDto } from './dto/share-slip.dto';
import { UpdateVarganiSlipDto } from './dto/update-vargani-slip.dto';
import { VarganiService } from './vargani.service';

@ApiTags('vargani')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vargani')
export class VarganiController {
  constructor(private readonly varganiService: VarganiService) {}

  @Get('active-form')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  getActiveForm(@AuthUser() ctx: AuthContext) {
    return this.varganiService.getActiveForm(ctx);
  }

  @Post('slips')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  createSlip(@AuthUser() ctx: AuthContext, @Body() dto: CreateVarganiSlipDto) {
    return this.varganiService.createSlip(ctx, dto);
  }

  @Get('slips')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  listSlips(@AuthUser() ctx: AuthContext, @Query() query: PaginationQueryDto) {
    return this.varganiService.listSlips(ctx, query);
  }

  @Get('slips/:id')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  getSlip(@AuthUser() ctx: AuthContext, @Param('id') id: string) {
    return this.varganiService.getSlip(ctx, id);
  }

  @Get('slips/:id/receipt.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  getReceiptHtml(@AuthUser() ctx: AuthContext, @Param('id') id: string) {
    return this.varganiService.renderReceiptHtml(ctx, id);
  }

  @Post('slips/:id/share')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  shareSlip(@AuthUser() ctx: AuthContext, @Param('id') id: string, @Body() dto: ShareSlipDto) {
    return this.varganiService.recordShare(ctx, id, dto);
  }

  @Patch('slips/:id')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  updateSlip(@AuthUser() ctx: AuthContext, @Param('id') id: string, @Body() dto: UpdateVarganiSlipDto) {
    return this.varganiService.updateSlip(ctx, id, dto);
  }

  @Post('slips/:id/cancel')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  cancelSlip(@AuthUser() ctx: AuthContext, @Param('id') id: string, @Body() dto: CancelSlipDto) {
    return this.varganiService.cancelSlip(ctx, id, dto);
  }
}

@ApiTags('public-receipts')
@Controller('public/vargani')
export class PublicVarganiReceiptController {
  constructor(private readonly varganiService: VarganiService) {}

  @Get('receipts/:token.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getSignedReceiptHtml(@Param('token') token: string) {
    return this.varganiService.renderPublicReceiptHtmlByToken(token);
  }

  @Get('slips/:id/receipt.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getPublicReceiptHtml(@Param('id') id: string, @Query('token') token?: string) {
    return this.varganiService.renderPublicReceiptHtml(id, token);
  }
}
