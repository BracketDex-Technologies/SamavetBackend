import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

@ApiTags('members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/festivals/:festivalId')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post('groups')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  createGroup(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.membersService.createGroup(ctx, mandalId, festivalId, dto);
  }

  @Get('groups')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  listGroups(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
  ) {
    return this.membersService.listGroups(ctx, mandalId, festivalId);
  }

  @Post('members')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  createMember(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: CreateMemberDto,
  ) {
    return this.membersService.createMember(ctx, mandalId, festivalId, dto);
  }

  @Get('members')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  listMembers(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
  ) {
    return this.membersService.listMembers(ctx, mandalId, festivalId);
  }

  @Patch('members/:memberId')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  updateMember(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.updateMember(ctx, mandalId, festivalId, memberId, dto);
  }

  @Delete('members/:memberId')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  archiveMember(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.membersService.archiveMember(ctx, mandalId, festivalId, memberId);
  }
}
