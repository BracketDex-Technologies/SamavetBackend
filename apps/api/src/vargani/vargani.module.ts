import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { PublicVarganiReceiptController, VarganiController } from './vargani.controller';
import { VarganiService } from './vargani.service';

@Module({
  controllers: [VarganiController, PublicVarganiReceiptController],
  imports: [AuthModule, JobsModule],
  providers: [VarganiService],
})
export class VarganiModule {}
