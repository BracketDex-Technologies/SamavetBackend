import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [ExpensesController],
  imports: [AuthModule],
  providers: [ExpensesService],
})
export class ExpensesModule {}
