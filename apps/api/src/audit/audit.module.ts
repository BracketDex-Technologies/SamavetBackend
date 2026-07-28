import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController],
  imports: [AuthModule, PrismaModule],
  providers: [AuditService],
})
export class AuditModule {}
