import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';
import { AuditEventsQueryDto } from './dto/audit-events-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN)
  listEvents(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Query() query: AuditEventsQueryDto,
  ) {
    return this.auditService.listEvents(ctx, mandalId, query);
  }
}
