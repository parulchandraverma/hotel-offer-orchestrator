import pino from 'pino';
import type { HotelCacheRepository } from '../src/cache/hotelCache.repository';
import { ServiceBusyError, UpstreamUnavailableError } from '../src/lib/errors';
import { HotelService } from '../src/services/hotel.service';
import type { OfferOrchestrator } from '../src/temporal/offerOrchestrator';
import type { CityOffers } from '../src/types/hotel';

const live = (degraded = false): CityOffers => ({
  hotels: [
    { id: 'a', name: 'A', city: 'delhi', price: 3000, commissionPct: 5, supplier: 'supplierA' },
    { id: 'b', name: 'B', city: 'delhi', price: 9000, commissionPct: 5, supplier: 'supplierB' },
  ],
  meta: {
    city: 'delhi',
    degraded,
    failedSuppliers: degraded ? ['supplierB'] : [],
    suppliers: { supplierA: { status: 'ok', offers: 1 }, supplierB: { status: degraded ? 'failed' : 'ok', offers: degraded ? 0 : 1 } },
    fetchedAt: 'now',
  },
});

function setup(overrides: Partial<Record<keyof HotelCacheRepository, jest.Mock>> = {}) {
  const cache = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    acquireLock: jest.fn().mockResolvedValue('token'),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    waitForCity: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
  const orchestrator = { fetchCityOffers: jest.fn().mockResolvedValue(live()) };
  const service = new HotelService(
    cache as unknown as HotelCacheRepository,
    orchestrator as OfferOrchestrator,
    { cacheTtlSeconds: 300, degradedCacheTtlSeconds: 30, lockTtlMs: 5000, lockWaitMs: 1000 },
    pino({ level: 'silent' }),
  );
  return { cache, orchestrator, service };
}

describe('HotelService', () => {
  it('cache hit: returns cached data and never starts a workflow', async () => {
    const { cache, orchestrator, service } = setup();
    cache.read.mockResolvedValueOnce(live());
    const res = await service.search({ city: 'delhi', minPrice: 1000 });
    expect(res.meta.source).toBe('cache');
    expect(cache.read).toHaveBeenCalledWith('delhi', { min: 1000, max: '+inf' });
    expect(orchestrator.fetchCityOffers).not.toHaveBeenCalled();
  });

  it('cache miss: runs workflow, caches full list, filters in memory, releases lock', async () => {
    const { cache, orchestrator, service } = setup();
    const res = await service.search({ city: 'delhi', minPrice: 4000, maxPrice: 12000 });
    expect(orchestrator.fetchCityOffers).toHaveBeenCalledWith('delhi');
    expect(cache.write).toHaveBeenCalledWith('delhi', live(), 300);
    expect(res.data.map((h) => h.id)).toEqual(['b']);
    expect(res.meta).toMatchObject({ source: 'live', count: 1, filters: { minPrice: 4000, maxPrice: 12000 } });
    expect(cache.releaseLock).toHaveBeenCalledWith('delhi', 'token');
  });

  it('single-flight: 50 concurrent misses for one city -> exactly 1 workflow', async () => {
    const { orchestrator, service } = setup();
    orchestrator.fetchCityOffers.mockImplementation(() => new Promise((r) => setTimeout(() => r(live()), 20)));
    const results = await Promise.all(Array.from({ length: 50 }, () => service.search({ city: 'delhi' })));
    expect(orchestrator.fetchCityOffers).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.data.length === 2)).toBe(true);
  });

  it('another instance holds the lock: waits, then serves from cache', async () => {
    const { cache, orchestrator, service } = setup({
      acquireLock: jest.fn().mockResolvedValue(null),
      waitForCity: jest.fn().mockResolvedValue(true),
    });
    cache.read.mockResolvedValueOnce(null).mockResolvedValueOnce(live());
    const res = await service.search({ city: 'delhi' });
    expect(res.meta.source).toBe('cache');
    expect(orchestrator.fetchCityOffers).not.toHaveBeenCalled();
    expect(cache.releaseLock).not.toHaveBeenCalled();
  });

  it('lock wait times out: fails open and fetches itself', async () => {
    const { orchestrator, service } = setup({ acquireLock: jest.fn().mockResolvedValue(null) });
    const res = await service.search({ city: 'delhi' });
    expect(res.meta.source).toBe('live');
    expect(orchestrator.fetchCityOffers).toHaveBeenCalledTimes(1);
  });

  it('degraded result is cached with the short TTL and flagged in meta', async () => {
    const { cache, orchestrator, service } = setup();
    orchestrator.fetchCityOffers.mockResolvedValue(live(true));
    const res = await service.search({ city: 'delhi' });
    expect(cache.write).toHaveBeenCalledWith('delhi', expect.anything(), 30);
    expect(res.meta).toMatchObject({ degraded: true, failedSuppliers: ['supplierB'] });
  });

  it('cache write failure does not fail the request', async () => {
    const { service } = setup({ write: jest.fn().mockRejectedValue(new Error('redis down')) });
    await expect(service.search({ city: 'delhi' })).resolves.toMatchObject({ meta: { source: 'live' } });
  });

  it('all suppliers down: propagates 502 and still releases the lock', async () => {
    const { cache, orchestrator, service } = setup();
    orchestrator.fetchCityOffers.mockRejectedValue(new UpstreamUnavailableError());
    await expect(service.search({ city: 'delhi' })).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(cache.releaseLock).toHaveBeenCalled();
  });

  it('cache still empty after another instance finished: 503 busy', async () => {
    const { service } = setup({ acquireLock: jest.fn().mockResolvedValue(null), waitForCity: jest.fn().mockResolvedValue(true) });
    await expect(service.search({ city: 'delhi' })).rejects.toBeInstanceOf(ServiceBusyError);
  });
});
