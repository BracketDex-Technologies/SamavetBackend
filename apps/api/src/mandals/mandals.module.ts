import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { MandalsController } from './mandals.controller';
import { MandalsService } from './mandals.service';

@Module({
  controllers: [MandalsController],
  imports: [AuthModule, StorageModule],
  providers: [MandalsService],
})
export class MandalsModule {}
