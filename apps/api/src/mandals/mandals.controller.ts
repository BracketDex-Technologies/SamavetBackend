import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateMandalDto } from './dto/create-mandal.dto';
import { CreateMandalUserDto } from './dto/create-mandal-user.dto';
import { ListMandalsQueryDto } from './dto/list-mandals-query.dto';
import { UpdateMandalUserDto } from './dto/update-mandal-user.dto';
import { UpdateMandalDto } from './dto/update-mandal.dto';
import { UpdateMandalStatusDto } from './dto/update-mandal-status.dto';
import { MandalsService } from './mandals.service';

@ApiTags('mandals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals')
export class MandalsController {
  constructor(private readonly mandalsService: MandalsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiCreatedResponse({ description: 'Mandal and first mandal admin created.' })
  create(@Body() dto: CreateMandalDto) {
    return this.mandalsService.create(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Paginated mandal list.' })
  list(@Query() query: ListMandalsQueryDto) {
    return this.mandalsService.list(query);
  }

  @Get('whatsapp/templates')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Authkey WhatsApp templates available for mandal assignment.' })
  listWhatsAppTemplates(@Query('refresh') refresh?: string) {
    return this.mandalsService.listWhatsAppTemplates(refresh === 'true');
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Mandal details.' })
  getById(@Param('id') id: string) {
    return this.mandalsService.getById(id);
  }

  @Get(':id/users')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'All login accounts for a mandal.' })
  listUsers(@Param('id') id: string) {
    return this.mandalsService.listUsers(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Mandal details updated.' })
  updateMandal(@Param('id') id: string, @Body() dto: UpdateMandalDto) {
    return this.mandalsService.updateMandal(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Mandal deleted.' })
  deleteMandal(@Param('id') id: string) {
    return this.mandalsService.deleteMandal(id);
  }

  @Post(':id/users')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiCreatedResponse({ description: 'Creates an additional mandal login account.' })
  createUser(@Param('id') id: string, @Body() dto: CreateMandalUserDto) {
    return this.mandalsService.createUser(id, dto);
  }

  @Patch(':id/users/:userId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Updates a mandal login account.' })
  updateUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMandalUserDto,
  ) {
    return this.mandalsService.updateUser(id, userId, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOkResponse({ description: 'Mandal status updated.' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateMandalStatusDto) {
    return this.mandalsService.updateStatus(id, dto);
  }
}
