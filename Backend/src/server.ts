import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, pingDatabase } from './db/index.js';

/**
 * Server startup — separate from app creation (src/app.ts):
 * 1. build the app,
 * 2. listen,
 * 3. verify database connectivity (fail fast on misconfiguration),
 * 4. install graceful shutdown handlers (stop accepting requests, close the
 *    HTTP server, close the database pool).
 *
 * Migrations are NOT applied here (by design). Run `npm run db:migrate`.
 */

async function main(): Promise<void> {
  const app = await buildApp();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    try {
      await app.close();
      await closeDatabase();
      app.log.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });

    await pingDatabase();
    app.log.info('Database connectivity verified');
  } catch (error) {
    app.log.error({ err: error }, 'Startup failed');
    try {
      await app.close();
      await closeDatabase();
    } catch {
      // best effort cleanup; the original error is reported below
    }
    process.exitCode = 1;
  }
}

void main();
