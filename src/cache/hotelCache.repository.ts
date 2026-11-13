import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { sleep } from '../lib/sleep';
import type { CityOffers, Hotel, OffersMeta, PriceRange } from '../types/hotel';
import { cacheKeys } from './keys';

// only delete the lock if it is still ours
const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

// data keys live a bit longer than meta, so if meta exists the data is there too
const DATA_TTL_GRACE_SECONDS = 5;

export class HotelCacheRepository {
  constructor(private readonly redis: Redis) {}

  // 2 round trips: (GET meta + ZRANGEBYSCORE) in one pipeline, then HMGET for matching ids
  async read(city: string, range: PriceRange): Promise<CityOffers | null> {
    const k = cacheKeys(city);
    const results = await this.redis.pipeline().get(k.meta).zrangebyscore(k.byPrice, range.min, range.max).exec();
    if (!results) return null;

    const [[metaErr, metaRaw], [idsErr, idsRaw]] = results as [[Error | null, string | null], [Error | null, string[]]];
    if (metaErr) throw metaErr;
    if (idsErr) throw idsErr;
    if (!metaRaw) return null;

    const meta = JSON.parse(metaRaw) as OffersMeta;
    if (idsRaw.length === 0) return { hotels: [], meta };

    const rows = await this.redis.hmget(k.details, ...idsRaw);
    const hotels: Hotel[] = [];
    for (const row of rows) if (row) hotels.push(JSON.parse(row) as Hotel);
    return { hotels, meta };
  }

  async write(city: string, offers: CityOffers, ttlSeconds: number): Promise<void> {
    const k = cacheKeys(city);
    const tx = this.redis.multi().del(k.byPrice, k.details);

    if (offers.hotels.length > 0) {
      const zargs: (string | number)[] = [];
      const hargs: string[] = [];
      for (const h of offers.hotels) {
        zargs.push(h.price, h.id);
        hargs.push(h.id, JSON.stringify(h));
      }
      tx.zadd(k.byPrice, ...zargs)
        .hset(k.details, ...hargs)
        .expire(k.byPrice, ttlSeconds + DATA_TTL_GRACE_SECONDS)
        .expire(k.details, ttlSeconds + DATA_TTL_GRACE_SECONDS);
    }
    // written even when there are no hotels, so empty cities are cached too
    tx.set(k.meta, JSON.stringify(offers.meta), 'EX', ttlSeconds);

    const res = await tx.exec();
    const failed = res?.find(([err]) => err);
    if (failed) throw failed[0];
  }

  async exists(city: string): Promise<boolean> {
    return (await this.redis.exists(cacheKeys(city).meta)) === 1;
  }

  async acquireLock(city: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const ok = await this.redis.set(cacheKeys(city).lock, token, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? token : null;
  }

  async releaseLock(city: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_LOCK_LUA, 1, cacheKeys(city).lock, token);
  }

  async waitForCity(city: string, maxWaitMs: number): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    let delay = 50;
    while (Date.now() < deadline) {
      await sleep(delay);
      if (await this.exists(city)) return true;
      delay = Math.min(delay * 2, 400);
    }
    return false;
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
