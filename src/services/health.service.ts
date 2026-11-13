import type { AppConfig } from '../config/env';
import { SUPPLIERS, type SupplierName } from '../types/hotel';

type CheckStatus = 'up' | 'down';
export interface CheckResult { status: CheckStatus; latencyMs: number; error?: string }
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  uptimeSec: number;
  checks: Record<'redis' | 'temporal' | SupplierName, CheckResult>;
}

export interface HealthDeps {
  pingRedis: () => Promise<unknown>;
  pingTemporal: () => Promise<unknown>;
  config: Pick<AppConfig, 'SUPPLIER_BASE_URL'>;
  timeoutMs?: number;
}

async function timed(fn: () => Promise<unknown>, timeoutMs: number): Promise<CheckResult> {
  const start = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs))),
    ]);
    return { status: 'up', latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return { status: 'down', latencyMs: Math.round(performance.now() - start), error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

// Redis or Temporal down = 503. A supplier down is only "degraded" since we can still serve results.
export async function checkHealth(deps: HealthDeps): Promise<HealthReport> {
  const t = deps.timeoutMs ?? 1500;
  const supplierCheck = (s: SupplierName) => () =>
    fetch(`${deps.config.SUPPLIER_BASE_URL}/${s}/hotels?city=delhi`, { signal: AbortSignal.timeout(t) }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });

  const [redis, temporal, ...suppliers] = await Promise.all([
    timed(deps.pingRedis, t),
    timed(deps.pingTemporal, t),
    ...SUPPLIERS.map((s) => timed(supplierCheck(s), t)),
  ]);

  const checks = { redis: redis!, temporal: temporal!, supplierA: suppliers[0]!, supplierB: suppliers[1]! };
  const coreDown = redis!.status === 'down' || temporal!.status === 'down';
  const anySupplierDown = suppliers.some((s) => s.status === 'down');

  return {
    status: coreDown ? 'down' : anySupplierDown ? 'degraded' : 'ok',
    uptimeSec: Math.round(process.uptime()),
    checks,
  };
}
