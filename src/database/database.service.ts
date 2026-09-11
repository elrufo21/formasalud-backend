import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { createServer, Server } from 'node:net';

import { Pool, QueryResult, QueryResultRow } from 'pg';
import { Client } from 'ssh2';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  private sshClient?: Client;
  private tunnelServer?: Server;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST'),
      port: this.configService.get<number>('DB_PORT'),
      user: this.configService.get<string>('DB_USER'),
      password: this.configService.get<string>('DB_PASSWORD'),
      database: this.configService.get<string>('DB_NAME'),

      max: 10,

      idleTimeoutMillis: 30000,

      connectionTimeoutMillis: 15000,
    });
  }

  async onModuleInit() {
    try {
      await this.startSshTunnel();

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

    this.sshClient?.end();

    if (this.tunnelServer) {
      await new Promise<void>((resolve) => this.tunnelServer?.close(() => resolve()));
    }
  }

  private async startSshTunnel() {
    if (this.configService.get<string>('SSH_TUNNEL_ENABLED') !== 'true') {
      return;
    }

    const host = this.configService.get<string>('SSH_HOST');
    const username = this.configService.get<string>('SSH_USER');
    const password = this.configService.get<string>('SSH_PASSWORD');

    if (!host || !username || !password) {
      throw new Error('Faltan las credenciales del túnel SSH');
    }

    const sshClient = new Client();

    await new Promise<void>((resolve, reject) => {
      sshClient
        .once('ready', resolve)
        .once('error', reject)
        .connect({ host, username, password, readyTimeout: 10000 });
    });

    const remoteHost =
      this.configService.get<string>('SSH_REMOTE_HOST') ?? '127.0.0.1';
    const remotePort = this.configService.get<number>('SSH_REMOTE_PORT') ?? 5432;
    const localPort = this.configService.get<number>('DB_PORT') ?? 5433;
    const tunnelServer = createServer((socket) => {
      sshClient.forwardOut(
        '127.0.0.1',
        socket.localPort ?? 0,
        remoteHost,
        remotePort,
        (error, stream) => {
          if (error) {
            socket.destroy(error);
            return;
          }

          socket.pipe(stream).pipe(socket);
        },
      );
    });

    await new Promise<void>((resolve, reject) => {
      tunnelServer.once('error', reject);
      tunnelServer.listen(localPort, '127.0.0.1', resolve);
    });

    this.sshClient = sshClient;
    this.tunnelServer = tunnelServer;
  }
}
