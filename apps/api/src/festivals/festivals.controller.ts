import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/auth-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateFestivalDto } from './dto/create-festival.dto';
import { UpdateFestivalStatusDto } from './dto/update-festival-status.dto';
import { FestivalsService } from './festivals.service';

@ApiTags('festivals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/festivals')
export class FestivalsController {
  constructor(private readonly festivalsService: FestivalsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  create(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Body() dto: CreateFestivalDto,
  ) {
    return this.festivalsService.create(ctx, mandalId, dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  list(@AuthUser() ctx: AuthContext, @Param('mandalId') mandalId: string) {
    return this.festivalsService.list(ctx, mandalId);
  }

  @Patch(':festivalId/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  updateStatus(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: UpdateFestivalStatusDto,
  ) {
    return this.festivalsService.updateStatus(ctx, mandalId, festivalId, dto);
  }
}
