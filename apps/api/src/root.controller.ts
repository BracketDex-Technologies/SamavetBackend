import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('root')
@Controller()
export class RootController {
  @Get()
  @Version(VERSION_NEUTRAL)
  @ApiOkResponse({
    description: 'API service discovery response.',
  })
  getRoot() {
    return {
      status: 'ok',
      service: 'digital-mandal-api',
      docs: '/api/docs',
      health: '/api/v1/health',
    };
  }
}
