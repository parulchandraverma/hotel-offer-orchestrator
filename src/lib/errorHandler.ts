import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.warn({ err }, err.message);
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = (err as FastifyError).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: { code: (err as FastifyError).code ?? 'BAD_REQUEST', message: err.message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` } }),
  );
}
