import { Body, Controller, Get, Header, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelSlipDto } from './dto/cancel-slip.dto';
import { CreateVarganiSlipDto } from './dto/create-vargani-slip.dto';
import { ListVarganiSlipsQueryDto } from './dto/list-vargani-slips-query.dto';
import { ShareSlipDto } from './dto/share-slip.dto';
import { UpdateVarganiSlipDto } from './dto/update-vargani-slip.dto';
import { UploadSlipReceiptImageDto } from './dto/upload-slip-receipt-image.dto';
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
  listSlips(@AuthUser() ctx: AuthContext, @Query() query: ListVarganiSlipsQueryDto) {
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

  @Post('slips/:id/receipt-image')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  uploadReceiptImage(
    @AuthUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: UploadSlipReceiptImageDto,
    @Query('autoShare') autoShare?: string,
  ) {
    return this.varganiService.uploadReceiptImage(ctx, id, dto, autoShare === 'true');
  }

  @Post('slips/:id/receipt-image-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024, files: 1 } }))
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  uploadReceiptImageFile(
    @AuthUser() ctx: AuthContext,
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
    @Query('autoShare') autoShare?: string,
  ) {
    return this.varganiService.uploadReceiptImageFile(ctx, id, file, autoShare === 'true');
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
