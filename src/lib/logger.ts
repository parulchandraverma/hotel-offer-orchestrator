import pino, { type Logger } from 'pino';
import type { AppConfig } from '../config/env';

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>, name = 'hotel-offer-orchestrator'): Logger {
  return pino({
    name,
    level: config.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
  });
}

export type { Logger };
