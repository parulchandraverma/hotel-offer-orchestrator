import { NativeConnection, Runtime, Worker, makeTelemetryFilterString, DefaultLogger } from '@temporalio/worker';
import { createSupplierActivities } from './activities/supplier.activities';
import { loadConfig } from './config/env';
import { createLogger } from './lib/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config, 'worker');

  Runtime.install({
    logger: new DefaultLogger(config.LOG_LEVEL === 'debug' ? 'DEBUG' : 'INFO', (entry) =>
      logger.info({ ...entry.meta }, entry.message),
    ),
    telemetryOptions: { logging: { filter: makeTelemetryFilterString({ core: 'WARN' }) } },
  });

  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve('./workflows'),
    activities: createSupplierActivities({
      baseUrl: config.SUPPLIER_BASE_URL,
      timeoutMs: config.SUPPLIER_TIMEOUT_MS,
    }),
    maxConcurrentActivityTaskExecutions: 200,
    // worker handles SIGINT/SIGTERM itself and lets running tasks finish
    shutdownGraceTime: '10 seconds',
  });

  logger.info({ taskQueue: config.TEMPORAL_TASK_QUEUE }, 'worker started');
  try {
    await worker.run();
  } finally {
    await connection.close();
    logger.info('worker stopped');
  }
}

main().catch((err) => {
  console.error('Worker failed', err);
  process.exit(1);
});
