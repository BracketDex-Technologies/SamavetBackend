import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AuditModule } from './audit/audit.module';
import { validateAppConfig } from './config/app-config';
import { AuthModule } from './auth/auth.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FestivalsModule } from './festivals/festivals.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { MandalsModule } from './mandals/mandals.module';
import { MembersModule } from './members/members.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { RootController } from './root.controller';
import { TemplatesModule } from './templates/templates.module';
import { TasksModule } from './tasks/tasks.module';
import { TranslationModule } from './translation/translation.module';
import { VarganiModule } from './vargani/vargani.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  controllers: [RootController],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env.local', '.env', join(__dirname, '../../../.env.local'), join(__dirname, '../../../.env')],
      isGlobal: true,
      validate: validateAppConfig,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        ttl: config.get<number>('RATE_LIMIT_TTL_MS') ?? 60_000,
        limit: config.get<number>('RATE_LIMIT_MAX') ?? 120,
      }],
    }),
    PrismaModule,
    AuthModule,
    MandalsModule,
    FestivalsModule,
    MembersModule,
    VarganiModule,
    ExpensesModule,
    TasksModule,
    TranslationModule,
    JobsModule,
    TemplatesModule,
    ReportsModule,
    AuditModule,
    HealthModule,
    WorkspaceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
