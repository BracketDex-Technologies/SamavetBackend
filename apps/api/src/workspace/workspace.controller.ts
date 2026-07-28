import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthContext } from '../auth/auth-context';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspace')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('bootstrap')
  @ApiOkResponse({ description: 'Returns the current user workspace in one optimized payload.' })
  bootstrap(@AuthUser() authUser: AuthContext) {
    return this.workspaceService.bootstrap(authUser);
  }

  @Get('summary')
  @ApiOkResponse({ description: 'Returns lightweight dashboard metrics for fast refreshes.' })
  summary(@AuthUser() authUser: AuthContext) {
    return this.workspaceService.summary(authUser);
  }
}
