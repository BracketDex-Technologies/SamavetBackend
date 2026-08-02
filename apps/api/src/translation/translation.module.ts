import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

@Module({
  controllers: [TranslationController],
  imports: [AuthModule],
  providers: [TranslationService],
})
export class TranslationModule {}
