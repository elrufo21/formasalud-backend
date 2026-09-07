import { ForbiddenException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

import { DATABASE_FUNCTIONS, DatabaseFunctionKey } from './execute.constants';

@Injectable()
export class ExecuteService {
  constructor(private readonly databaseService: DatabaseService) {}

  async execute(
    functionKey: DatabaseFunctionKey,
    action: string,
    data: Record<string, unknown> = {},
    context: Record<string, unknown> = {},
  ) {
    const functionName = DATABASE_FUNCTIONS[functionKey];

    if (!functionName) {
      throw new ForbiddenException('Función no permitida');
    }

    const result = await this.databaseService.query(
      `
        SELECT public.fnc_execute(
          $1,
          $2,
          $3::jsonb,
          $4::jsonb
        ) AS data
        `,
      [functionName, action, JSON.stringify(data), JSON.stringify(context)],
    );

    return result.rows[0]?.data;
  }
}
