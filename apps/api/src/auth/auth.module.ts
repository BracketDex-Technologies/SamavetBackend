import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, Reflector],
  imports: [JwtModule.register({})],
  providers: [AuthService, JwtAuthGuard, RolesGuard, Reflector],
})
export class AuthModule {}
