import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadTemplateAssetDto {
  @IsString()
  dataUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fileName?: string;
}
