import { Body, Controller, Post } from '@nestjs/common';
import { ExecuteService } from './execute.service';
import { DatabaseFunctionKey } from './execute.constants';

export class ExecuteDto {
  function: DatabaseFunctionKey;
  action: string;
  data?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

@Controller('execute')
export class ExecuteController {
  constructor(private readonly executeService: ExecuteService) {}

  @Post()
  execute(@Body() dto: ExecuteDto) {
    return this.executeService.execute(
      dto.function,
      dto.action,
      dto.data || {},
      dto.context || {},
    );
  }
}
