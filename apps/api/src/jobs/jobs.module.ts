import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  exports: [JobsService],
  imports: [PrismaModule],
  providers: [JobsService],
})
export class JobsModule {}
