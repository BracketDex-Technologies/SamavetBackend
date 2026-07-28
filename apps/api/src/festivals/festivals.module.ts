import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FestivalsController } from './festivals.controller';
import { FestivalsService } from './festivals.service';

@Module({
  controllers: [FestivalsController],
  imports: [AuthModule],
  providers: [FestivalsService],
})
export class FestivalsModule {}
