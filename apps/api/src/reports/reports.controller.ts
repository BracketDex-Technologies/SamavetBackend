import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollectionReportQueryDto } from './dto/collection-report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/festivals/:festivalId/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('collections')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  getCollectionReport(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Query() query: CollectionReportQueryDto,
  ) {
    return this.reportsService.getCollectionReport(ctx, mandalId, festivalId, query);
  }

  @Get('collections.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="digital-vargani-collections.csv"')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  exportCollectionReportCsv(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Query() query: CollectionReportQueryDto,
  ) {
    return this.reportsService.exportCollectionReportCsv(ctx, mandalId, festivalId, query);
  }
}
