import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AuditEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'vargani_slip' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityId?: string;

  @ApiPropertyOptional({ example: 'created' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
