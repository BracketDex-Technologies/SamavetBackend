import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TransliterateMarathiDto } from './dto/transliterate-marathi.dto';
import { TranslationService } from './translation.service';

@ApiTags('translation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('translation')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('marathi/transliterate')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER, UserRole.MEMBER)
  transliterateMarathi(@Body() dto: TransliterateMarathiDto) {
    return this.translationService.transliterateMarathi(dto.text);
  }
}
