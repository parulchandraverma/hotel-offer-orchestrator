import type { Logger } from 'pino';
import type { HotelCacheRepository } from '../cache/hotelCache.repository';
import { ServiceBusyError } from '../lib/errors';
import type { OfferOrchestrator } from '../temporal/offerOrchestrator';
import type { CityOffers, HotelSearchQuery, HotelSearchResponse } from '../types/hotel';
import { filterByRange, toScoreRange } from './priceRange';

export interface HotelServiceOptions {
  cacheTtlSeconds: number;
  degradedCacheTtlSeconds: number;
  lockTtlMs: number;
  lockWaitMs: number;
}

export class HotelService {
  // concurrent misses for the same city in this process share one promise
  private readonly inflight = new Map<string, Promise<CityOffers | null>>();

  constructor(
    private readonly cache: HotelCacheRepository,
    private readonly orchestrator: OfferOrchestrator,
    private readonly opts: HotelServiceOptions,
    private readonly log: Logger,
  ) {}

  async search(query: HotelSearchQuery): Promise<HotelSearchResponse> {
    const range = toScoreRange(query.minPrice, query.maxPrice);

    const cached = await this.cache.read(query.city, range);
    if (cached) return this.toResponse(cached, 'cache', query);

    const fresh = await this.singleFlight(query.city);
    if (fresh) return this.toResponse({ hotels: filterByRange(fresh.hotels, range), meta: fresh.meta }, 'live', query);

    // another instance filled the cache while we were waiting
    const afterWait = await this.cache.read(query.city, range);
    if (afterWait) return this.toResponse(afterWait, 'cache', query);
    throw new ServiceBusyError();
  }

  private singleFlight(city: string): Promise<CityOffers | null> {
    const existing = this.inflight.get(city);
    if (existing) return existing;
    const p = this.refresh(city).finally(() => this.inflight.delete(city));
    this.inflight.set(city, p);
    return p;
  }

  // returns null if another instance did the fetch and the cache is ready
  private async refresh(city: string): Promise<CityOffers | null> {
    const token = await this.cache.acquireLock(city, this.opts.lockTtlMs);
    if (!token) {
      if (await this.cache.waitForCity(city, this.opts.lockWaitMs)) return null;
      this.log.warn({ city }, 'lock wait timed out, fetching without lock');
    }

    try {
      const offers = await this.orchestrator.fetchCityOffers(city);
      const ttl = offers.meta.degraded ? this.opts.degradedCacheTtlSeconds : this.opts.cacheTtlSeconds;
      await this.cache.write(city, offers, ttl).catch((err: unknown) => {
        this.log.error({ err, city }, 'cache write failed');
      });
      if (offers.meta.degraded) this.log.warn({ city, failed: offers.meta.failedSuppliers }, 'serving degraded offers');
      return offers;
    } finally {
      if (token) await this.cache.releaseLock(city, token).catch(() => undefined);
    }
  }

  private toResponse(offers: CityOffers, source: 'cache' | 'live', q: HotelSearchQuery): HotelSearchResponse {
    return {
      data: offers.hotels,
      meta: {
        ...offers.meta,
        source,
        count: offers.hotels.length,
        filters: { minPrice: q.minPrice ?? null, maxPrice: q.maxPrice ?? null },
      },
    };
  }
}
