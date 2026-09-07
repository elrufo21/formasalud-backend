import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST'),
      port: this.configService.get<number>('DB_PORT'),
      user: this.configService.get<string>('DB_USER'),
      password: this.configService.get<string>('DB_PASSWORD'),
      database: this.configService.get<string>('DB_NAME'),

      max: 10,

      idleTimeoutMillis: 30000,

      connectionTimeoutMillis: 5000,
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();

      console.log('Conexión a PostgreSQL establecida');

      client.release();
    } catch (error) {
      console.error(' Error conectando a PostgreSQL:', error);

      throw error;
    }
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
