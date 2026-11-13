import { z } from 'zod';

const supplierMode = z.enum(['ok', 'fail', 'timeout']);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
    TEMPORAL_NAMESPACE: z.string().default('default'),
    TEMPORAL_TASK_QUEUE: z.string().default('hotel-offers'),

    SUPPLIER_BASE_URL: z.string().url().default('http://localhost:3000'),
    SUPPLIER_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    SUPPLIER_A_MODE: supplierMode.default('ok'),
    SUPPLIER_B_MODE: supplierMode.default('ok'),
    SUPPLIER_MIN_LATENCY_MS: z.coerce.number().int().nonnegative().default(50),
    SUPPLIER_MAX_LATENCY_MS: z.coerce.number().int().nonnegative().default(400),

    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    DEGRADED_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
    LOCK_TTL_MS: z.coerce.number().int().positive().default(8000),
    LOCK_WAIT_MS: z.coerce.number().int().positive().default(5000),
    WORKFLOW_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  })
  .refine((e) => e.SUPPLIER_MIN_LATENCY_MS <= e.SUPPLIER_MAX_LATENCY_MS, {
    message: 'SUPPLIER_MIN_LATENCY_MS must be <= SUPPLIER_MAX_LATENCY_MS',
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }
  return parsed.data;
}
