import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  imports: [PrismaModule],
  providers: [TasksService],
})
export class TasksModule {}
