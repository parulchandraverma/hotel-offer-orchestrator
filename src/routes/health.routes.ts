import type { FastifyInstance } from 'fastify';
import { checkHealth, type HealthDeps } from '../services/health.service';

export async function healthRoutes(app: FastifyInstance, opts: { deps: HealthDeps }): Promise<void> {
  app.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    const report = await checkHealth(opts.deps);
    return reply.code(report.status === 'down' ? 503 : 200).send(report);
  });
}
