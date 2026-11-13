import pino from 'pino';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { UpstreamUnavailableError } from '../src/lib/errors';
import type { HotelService } from '../src/services/hotel.service';

const config = loadConfig({ NODE_ENV: 'test', SUPPLIER_MIN_LATENCY_MS: '0', SUPPLIER_MAX_LATENCY_MS: '0' } as NodeJS.ProcessEnv);

async function makeApp(search: jest.Mock, ping = { redis: jest.fn().mockResolvedValue('PONG'), temporal: jest.fn().mockResolvedValue({}) }) {
  const app = await buildApp({
    config,
    logger: pino({ level: 'silent' }),
    hotelService: { search } as unknown as HotelService,
    health: { config: { SUPPLIER_BASE_URL: 'http://127.0.0.1:1' }, pingRedis: ping.redis, pingTemporal: ping.temporal, timeoutMs: 200 },
  });
  await app.ready();
  return app;
}

describe('HTTP layer', () => {
  it('GET /api/hotels validates and forwards parsed query', async () => {
    const search = jest.fn().mockResolvedValue({ data: [], meta: { source: 'cache', degraded: false, failedSuppliers: [] } });
    const app = await makeApp(search);
    const res = await app.inject({ url: '/api/hotels?city=Delhi&minPrice=4000&maxPrice=12000' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(search).toHaveBeenCalledWith({ city: 'delhi', minPrice: 4000, maxPrice: 12000 });
    await app.close();
  });

  it('returns 400 with details on invalid query', async () => {
    const app = await makeApp(jest.fn());
    const res = await app.inject({ url: '/api/hotels?city=delhi&minPrice=9000&maxPrice=100' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('maps AppError to its status code', async () => {
    const app = await makeApp(jest.fn().mockRejectedValue(new UpstreamUnavailableError()));
    const res = await app.inject({ url: '/api/hotels?city=delhi' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('SUPPLIERS_UNAVAILABLE');
    await app.close();
  });

  it('mock suppliers serve overlapping inventory and honour ?simulate=fail', async () => {
    const app = await makeApp(jest.fn());
    const a = await app.inject({ url: '/supplierA/hotels?city=delhi' });
    const b = await app.inject({ url: '/supplierB/hotels?city=delhi' });
    expect(a.json().hotels.length).toBeGreaterThan(0);
    expect(b.json().results.length).toBeGreaterThan(0);
    expect((await app.inject({ url: '/supplierB/hotels?city=delhi&simulate=fail' })).statusCode).toBe(503);
    await app.close();
  });

  it('/health: core up + suppliers unreachable -> 200 degraded; redis down -> 503', async () => {
    const app = await makeApp(jest.fn());
    const res = await app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { redis: { status: 'up' }, supplierA: { status: 'down' } } });
    await app.close();

    const down = await makeApp(jest.fn(), { redis: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), temporal: jest.fn().mockResolvedValue({}) });
    const res2 = await down.inject({ url: '/health' });
    expect(res2.statusCode).toBe(503);
    expect(res2.json().status).toBe('down');
    await down.close();
  });

  it('unknown route -> 404 JSON', async () => {
    const app = await makeApp(jest.fn());
    expect((await app.inject({ url: '/nope' })).json().error.code).toBe('NOT_FOUND');
    await app.close();
  });
});
