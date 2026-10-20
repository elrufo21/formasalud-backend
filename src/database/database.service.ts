import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { createServer, Server } from 'node:net';

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Client } from 'ssh2';

interface ConnectionError extends Error {
  code?: string;
  errno?: number | string;
  syscall?: string;
  address?: string;
  port?: number;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private sshClient?: Client;
  private tunnelServer?: Server;
  private sshConnected = false;
  private sshReconnectTimer?: NodeJS.Timeout;
  private shuttingDown = false;

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

    this.pool.on('error', (error) => {
      this.logger.error(
        `Conexión inactiva de PostgreSQL perdida: ${this.describeError(error)}`,
        error.stack,
      );
    });
  }

  async onModuleInit() {
    try {
      await this.startSshTunnel();

      const client = await this.pool.connect();

      this.logger.log('Conexión a PostgreSQL establecida');

      client.release();
    } catch (error) {
      this.logger.error(
        `Falló la conexión inicial a PostgreSQL: ${this.describeError(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    try {
      return await this.pool.query<T>(text, params);
    } catch (error) {
      this.logger.error(
        `Falló consulta PostgreSQL (túnel SSH ${this.sshConnected ? 'conectado' : 'desconectado'}): ${this.describeError(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (!this.sshConnected || this.isConnectionError(error)) {
        throw new ServiceUnavailableException({
          message: 'La base de datos no está disponible temporalmente',
          error: 'DATABASE_UNAVAILABLE',
        });
      }

      throw error;
    }
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.sshReconnectTimer) clearTimeout(this.sshReconnectTimer);
    await this.pool.end();

    this.sshClient?.end();

    if (this.tunnelServer) {
      await new Promise<void>((resolve) => this.tunnelServer?.close(() => resolve()));
    }
  }

  private async startSshTunnel() {
    if (this.configService.get<string>('SSH_TUNNEL_ENABLED') !== 'true') {
      this.sshConnected = true;
      return;
    }

    await this.connectSshClient();

    const remoteHost =
      this.configService.get<string>('SSH_REMOTE_HOST') ?? '127.0.0.1';
    const remotePort = this.configService.get<number>('SSH_REMOTE_PORT') ?? 5432;
    const localPort = this.configService.get<number>('DB_PORT') ?? 5433;
    const tunnelServer = createServer((socket) => {
      socket.on('error', (error) =>
        this.logger.warn(`Socket local del túnel: ${this.describeError(error)}`),
      );

      const sshClient = this.sshClient;
      if (!this.sshConnected || !sshClient) {
        socket.destroy();
        return;
      }

      sshClient.forwardOut(
        '127.0.0.1',
        socket.localPort ?? 0,
        remoteHost,
        remotePort,
        (error, stream) => {
          if (error) {
            this.logger.warn(
              `No se pudo abrir el túnel a PostgreSQL: ${this.describeError(error)}`,
            );
            socket.destroy();
            return;
          }

          stream.on('error', (streamError) => {
            this.logger.warn(
              `El túnel a PostgreSQL se interrumpió: ${this.describeError(streamError)}`,
            );
            socket.destroy();
          });
          socket.pipe(stream).pipe(socket);
        },
      );
    });

    tunnelServer.on('error', (error) =>
      this.logger.error(`Servidor local del túnel: ${this.describeError(error)}`),
    );

    await new Promise<void>((resolve, reject) => {
      tunnelServer.once('error', reject);
      tunnelServer.listen(localPort, '127.0.0.1', resolve);
    });

    this.tunnelServer = tunnelServer;
  }

  private async connectSshClient() {
    const host = this.configService.get<string>('SSH_HOST');
    const username = this.configService.get<string>('SSH_USER');
    const password = this.configService.get<string>('SSH_PASSWORD');
    if (!host || !username || !password) {
      throw new Error('Faltan las credenciales del túnel SSH');
    }

    const sshClient = new Client();
    const markUnavailable = (error?: Error) => {
      if (this.sshClient !== sshClient) return;
      this.sshClient = undefined;
      this.sshConnected = false;
      this.logger.warn(
        `Túnel SSH no disponible: ${error ? this.describeError(error) : 'conexión cerrada'}`,
      );
      this.scheduleSshReconnect();
    };
    sshClient.on('error', markUnavailable).on('close', () => markUnavailable());

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        sshClient.removeListener('ready', onReady);
        sshClient.removeListener('error', onError);
        callback();
      };
      const onReady = () => settle(resolve);
      const onError = (error: Error) => settle(() => reject(error));
      const timeout = setTimeout(() => {
        settle(() => {
          sshClient.end();
          reject(new Error('Tiempo de espera al conectar el túnel SSH (10 s)'));
        });
      }, 10000);

      sshClient
        .once('ready', onReady)
        .once('error', onError)
        .connect({
          host,
          username,
          password,
          readyTimeout: 10000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 3,
        });
    });

    this.sshClient = sshClient;
    this.sshConnected = true;
  }

  private scheduleSshReconnect() {
    if (this.shuttingDown || this.sshReconnectTimer) return;
    this.sshReconnectTimer = setTimeout(() => {
      this.sshReconnectTimer = undefined;
      void this.connectSshClient()
        .then(() => this.logger.log('Túnel SSH restablecido'))
        .catch((error: unknown) => {
          this.logger.warn(
            `No se pudo restablecer el túnel SSH: ${this.describeError(error)}. Se reintentará en 5 s.`,
          );
          this.scheduleSshReconnect();
        });
    }, 5000);
    this.sshReconnectTimer.unref();
  }

  private isConnectionError(error: unknown) {
    if (!(error instanceof Error)) return false;

    return /connection (terminated|refused|timed out)|timeout|socket hang up/i.test(
      error.message,
    );
  }

  private describeError(error: unknown) {
    if (!(error instanceof Error)) return String(error);

    const connectionError = error as ConnectionError;
    return JSON.stringify({
      name: connectionError.name,
      message: connectionError.message,
      code: connectionError.code,
      errno: connectionError.errno,
      syscall: connectionError.syscall,
      address: connectionError.address,
      port: connectionError.port,
    });
  }
}
