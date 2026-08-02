import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { PublicVarganiReceiptController, VarganiController } from './vargani.controller';
import { JobDrainController } from './job-drain.controller';
import { JobDrainService } from './job-drain.service';
import { VarganiService } from './vargani.service';
import { WhatsAppReceiptService } from './whatsapp-receipt.service';

@Module({
  controllers: [VarganiController, PublicVarganiReceiptController, JobDrainController],
  imports: [AuthModule, JobsModule, StorageModule],
  providers: [VarganiService, WhatsAppReceiptService, JobDrainService],
  exports: [WhatsAppReceiptService],
})
export class VarganiModule {}
