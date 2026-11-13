import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env';
import { sleep } from '../lib/sleep';
import { SUPPLIER_A_DATA, SUPPLIER_B_DATA } from './mockData';

type Mode = 'ok' | 'fail' | 'timeout';

const QuerySchema = z.object({
  city: z.string().trim().toLowerCase().min(2),
  // ?simulate=fail or ?simulate=timeout for quick manual testing
  simulate: z.enum(['ok', 'fail', 'timeout']).optional(),
});

const ModeSchema = z.object({ mode: z.enum(['ok', 'fail', 'timeout']) });

// Mock suppliers are served by the API process, the worker calls them over HTTP like a real supplier.
export async function mockSupplierRoutes(app: FastifyInstance, opts: { config: AppConfig }): Promise<void> {
  const { config } = opts;
  const modes: Record<'supplierA' | 'supplierB', Mode> = {
    supplierA: config.SUPPLIER_A_MODE,
    supplierB: config.SUPPLIER_B_MODE,
  };

  const latency = () =>
    config.SUPPLIER_MIN_LATENCY_MS + Math.floor(Math.random() * (config.SUPPLIER_MAX_LATENCY_MS - config.SUPPLIER_MIN_LATENCY_MS + 1));

  async function simulate(mode: Mode, reply: FastifyReply): Promise<boolean> {
    if (mode === 'timeout') {
      await sleep(config.SUPPLIER_TIMEOUT_MS * 3);
      return true;
    }
    await sleep(latency());
    if (mode === 'fail') {
      await reply.code(503).send({ error: 'Supplier temporarily unavailable' });
      return false;
    }
    return true;
  }

  app.get('/supplierA/hotels', async (req, reply) => {
    const q = QuerySchema.parse(req.query);
    if (!(await simulate(q.simulate ?? modes.supplierA, reply))) return reply;
    return { supplier: 'A', city: q.city, hotels: SUPPLIER_A_DATA[q.city] ?? [] };
  });

  app.get('/supplierB/hotels', async (req, reply) => {
    const q = QuerySchema.parse(req.query);
    if (!(await simulate(q.simulate ?? modes.supplierB, reply))) return reply;
    return { source: 'B', location: q.city, results: SUPPLIER_B_DATA[q.city] ?? [] };
  });

  // PUT /supplierA/mode {"mode":"fail"} to switch a supplier without restarting (not in production)
  if (config.NODE_ENV !== 'production') {
    for (const name of ['supplierA', 'supplierB'] as const) {
      app.put(`/${name}/mode`, async (req) => {
        modes[name] = ModeSchema.parse(req.body).mode;
        return { supplier: name, mode: modes[name] };
      });
    }
  }
}
