import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  listRecent(@AuthUser() ctx: AuthContext) {
    return this.jobsService.listRecent(ctx.role === UserRole.SUPER_ADMIN ? null : ctx.mandalId);
  }
}
