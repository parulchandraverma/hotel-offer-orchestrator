import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { HotelCacheRepository } from '../src/cache/hotelCache.repository';
import { cacheKeys } from '../src/cache/keys';
import { toScoreRange } from '../src/services/priceRange';
import type { CityOffers, Hotel } from '../src/types/hotel';

const hotel = (id: string, price: number): Hotel => ({ id, name: id, city: 'delhi', price, commissionPct: 10, supplier: 'supplierA' });
const offers = (hotels: Hotel[], degraded = false): CityOffers => ({
  hotels,
  meta: {
    city: 'delhi',
    degraded,
    failedSuppliers: degraded ? ['supplierB'] : [],
    suppliers: { supplierA: { status: 'ok', offers: hotels.length }, supplierB: { status: degraded ? 'failed' : 'ok', offers: 0 } },
    fetchedAt: '2026-11-13T05:00:00.000Z',
  },
});

describe('HotelCacheRepository (ZSET + HASH)', () => {
  let redis: Redis;
  let repo: HotelCacheRepository;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
    repo = new HotelCacheRepository(redis);
  });
  afterEach(() => redis.disconnect());

  it('miss when nothing cached', async () => {
    expect(await repo.read('delhi', toScoreRange())).toBeNull();
  });

  it('writes ZSET + HASH + meta with TTLs and reads back sorted by price', async () => {
    await repo.write('delhi', offers([hotel('c', 15000), hotel('a', 3000), hotel('b', 8000)]), 300);
    const k = cacheKeys('delhi');

    expect(await redis.zrange(k.byPrice, 0, -1, 'WITHSCORES')).toEqual(['a', '3000', 'b', '8000', 'c', '15000']);
    expect(await redis.hlen(k.details)).toBe(3);
    expect(await redis.ttl(k.meta)).toBeGreaterThan(0);
    expect(await redis.ttl(k.byPrice)).toBeGreaterThanOrEqual(await redis.ttl(k.meta)); // data outlives meta

    const all = await repo.read('delhi', toScoreRange());
    expect(all!.hotels.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('price filter goes through ZRANGEBYSCORE (inclusive) and fetches only matching details', async () => {
    await repo.write('delhi', offers([hotel('a', 3000), hotel('b', 4000), hotel('c', 12000), hotel('d', 12001)]), 300);
    const hmget = jest.spyOn(redis, 'hmget');

    const res = await repo.read('delhi', toScoreRange(4000, 12000));

    expect(res!.hotels.map((h) => h.id)).toEqual(['b', 'c']);
    expect(hmget).toHaveBeenCalledWith(cacheKeys('delhi').details, 'b', 'c');
  });

  it('empty filter result skips the HASH read; empty city is negatively cached', async () => {
    await repo.write('delhi', offers([]), 300);
    const hmget = jest.spyOn(redis, 'hmget');
    const res = await repo.read('delhi', toScoreRange(1, 2));
    expect(res).toEqual({ hotels: [], meta: expect.objectContaining({ city: 'delhi' }) });
    expect(hmget).not.toHaveBeenCalled();
  });

  it('rewrite replaces the previous snapshot (no stale hotels left behind)', async () => {
    await repo.write('delhi', offers([hotel('old', 1000), hotel('keep', 2000)]), 300);
    await repo.write('delhi', offers([hotel('keep', 1500)]), 300);
    const res = await repo.read('delhi', toScoreRange());
    expect(res!.hotels).toEqual([hotel('keep', 1500)]);
  });

  it('lock is exclusive and only released by its owner', async () => {
    const t1 = await repo.acquireLock('delhi', 5000);
    expect(t1).toEqual(expect.any(String));
    expect(await repo.acquireLock('delhi', 5000)).toBeNull();

    await repo.releaseLock('delhi', 'not-the-owner');
    expect(await repo.acquireLock('delhi', 5000)).toBeNull();

    await repo.releaseLock('delhi', t1!);
    expect(await repo.acquireLock('delhi', 5000)).toEqual(expect.any(String));
  });
});
