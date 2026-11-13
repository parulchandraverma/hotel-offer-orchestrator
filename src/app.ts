import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { AppConfig } from './config/env';
import { registerErrorHandler } from './lib/errorHandler';
import { healthRoutes } from './routes/health.routes';
import { hotelRoutes } from './routes/hotels.routes';
import type { HealthDeps } from './services/health.service';
import type { HotelService } from './services/hotel.service';
import { mockSupplierRoutes } from './suppliers/mockSuppliers.routes';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  hotelService: HotelService;
  health: HealthDeps;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // pino Logger and FastifyBaseLogger types don't line up exactly
    loggerInstance: deps.logger as unknown as FastifyBaseLogger,
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  registerErrorHandler(app);
  await app.register(mockSupplierRoutes, { config: deps.config });
  await app.register(hotelRoutes, { hotelService: deps.hotelService });
  await app.register(healthRoutes, { deps: deps.health });
  return app;
}
