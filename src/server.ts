import { Redis } from 'ioredis';
import { buildApp } from './app';
import { HotelCacheRepository } from './cache/hotelCache.repository';
import { loadConfig } from './config/env';
import { createLogger } from './lib/logger';
import { HotelService } from './services/hotel.service';
import { createTemporalClient } from './temporal/connection';
import { TemporalOfferOrchestrator } from './temporal/offerOrchestrator';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config, 'api');

  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableAutoPipelining: true });
  redis.on('error', (err) => logger.error({ err }, 'redis error'));

  const { client, connection } = await createTemporalClient(config);
  const cache = new HotelCacheRepository(redis);
  const orchestrator = new TemporalOfferOrchestrator(client, {
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowTimeoutMs: config.WORKFLOW_TIMEOUT_MS,
  });
  const hotelService = new HotelService(
    cache,
    orchestrator,
    {
      cacheTtlSeconds: config.CACHE_TTL_SECONDS,
      degradedCacheTtlSeconds: config.DEGRADED_CACHE_TTL_SECONDS,
      lockTtlMs: config.LOCK_TTL_MS,
      lockWaitMs: config.LOCK_WAIT_MS,
    },
    logger,
  );

  const app = await buildApp({
    config,
    logger,
    hotelService,
    health: {
      config,
      pingRedis: () => cache.ping(),
      pingTemporal: () => connection.healthService.check({}),
    },
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    try {
      await app.close();
      await Promise.allSettled([redis.quit(), connection.close()]);
      clearTimeout(force);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error('API failed to start', err);
  process.exit(1);
});
