import { dedupeOffers } from '../services/dedup';
import type { CityOffers, OffersMeta, SupplierName, SupplierOffer } from '../types/hotel';

export type SupplierFetcher = (city: string) => Promise<SupplierOffer[]>;
export type SupplierFetchers = Record<SupplierName, SupplierFetcher>;

export class AllSuppliersFailedError extends Error {
  constructor(public readonly failures: Partial<Record<SupplierName, string>>) {
    super(`All suppliers failed: ${Object.entries(failures).map(([s, e]) => `${s} (${e})`).join(', ')}`);
    this.name = 'AllSuppliersFailedError';
  }
}

const errorMessage = (e: unknown): string => {
  if (e && typeof e === 'object') {
    // ActivityFailure keeps the real reason in cause
    const cause = (e as { cause?: { message?: string } }).cause;
    if (cause?.message) return cause.message;
    if ('message' in e && typeof (e as Error).message === 'string') return (e as Error).message;
  }
  return String(e);
};

// No Temporal imports here so it can be tested with plain mocks.
export async function aggregateOffers(city: string, fetchers: SupplierFetchers, now: () => Date = () => new Date()): Promise<CityOffers> {
  const names = Object.keys(fetchers) as SupplierName[];
  const settled = await Promise.allSettled(names.map((name) => fetchers[name](city)));

  const offers: SupplierOffer[] = [];
  const failures: Partial<Record<SupplierName, string>> = {};
  const suppliers = {} as OffersMeta['suppliers'];

  settled.forEach((result, i) => {
    const name = names[i]!;
    if (result.status === 'fulfilled') {
      offers.push(...result.value);
      suppliers[name] = { status: 'ok', offers: result.value.length };
    } else {
      failures[name] = errorMessage(result.reason);
      suppliers[name] = { status: 'failed', offers: 0, error: failures[name] };
    }
  });

  const failedSuppliers = Object.keys(failures) as SupplierName[];
  if (failedSuppliers.length === names.length) throw new AllSuppliersFailedError(failures);

  return {
    hotels: dedupeOffers(offers),
    meta: {
      city,
      degraded: failedSuppliers.length > 0,
      failedSuppliers,
      suppliers,
      fetchedAt: now().toISOString(),
    },
  };
}
