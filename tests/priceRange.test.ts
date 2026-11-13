import { filterByRange, isUnbounded, toScoreRange } from '../src/services/priceRange';
import { cacheKeys } from '../src/cache/keys';
import { HotelSearchQuerySchema } from '../src/routes/schemas';
import type { Hotel } from '../src/types/hotel';

const h = (price: number): Hotel => ({ id: `h${price}`, name: `H${price}`, city: 'delhi', price, commissionPct: 5, supplier: 'supplierA' });

describe('toScoreRange (ZRANGEBYSCORE args)', () => {
  it('both bounds', () => expect(toScoreRange(4000, 12000)).toEqual({ min: 4000, max: 12000 }));
  it('only min -> +inf upper', () => expect(toScoreRange(4000)).toEqual({ min: 4000, max: '+inf' }));
  it('only max -> -inf lower', () => expect(toScoreRange(undefined, 12000)).toEqual({ min: '-inf', max: 12000 }));
  it('no bounds -> full range', () => {
    const r = toScoreRange();
    expect(r).toEqual({ min: '-inf', max: '+inf' });
    expect(isUnbounded(r)).toBe(true);
  });
  it('0 is a real bound, not "missing"', () => expect(toScoreRange(0, 0)).toEqual({ min: 0, max: 0 }));
});

describe('filterByRange matches ZRANGEBYSCORE inclusive semantics', () => {
  const hotels = [h(3000), h(4000), h(8000), h(12000), h(15000)];
  it('inclusive on both ends', () =>
    expect(filterByRange(hotels, toScoreRange(4000, 12000)).map((x) => x.price)).toEqual([4000, 8000, 12000]));
  it('open-ended', () => expect(filterByRange(hotels, toScoreRange(12000)).map((x) => x.price)).toEqual([12000, 15000]));
  it('unbounded returns a copy', () => {
    const out = filterByRange(hotels, toScoreRange());
    expect(out).toEqual(hotels);
    expect(out).not.toBe(hotels);
  });
});

describe('cache keys', () => {
  it('are namespaced per city with a cluster hash tag', () => {
    expect(cacheKeys('delhi')).toEqual({
      byPrice: 'hotels:{delhi}:by_price',
      details: 'hotels:{delhi}:details',
      meta: 'hotels:{delhi}:meta',
      lock: 'lock:hotels:{delhi}',
    });
  });
});

describe('HotelSearchQuerySchema', () => {
  it('normalises city and coerces prices', () =>
    expect(HotelSearchQuerySchema.parse({ city: ' Delhi ', minPrice: '4000', maxPrice: '12000' })).toEqual({
      city: 'delhi',
      minPrice: 4000,
      maxPrice: 12000,
    }));
  it('rejects minPrice > maxPrice', () => expect(HotelSearchQuerySchema.safeParse({ city: 'delhi', minPrice: 9, maxPrice: 1 }).success).toBe(false));
  it('rejects negative / non-numeric prices and bad cities', () => {
    expect(HotelSearchQuerySchema.safeParse({ city: 'delhi', minPrice: '-5' }).success).toBe(false);
    expect(HotelSearchQuerySchema.safeParse({ city: 'delhi', maxPrice: 'abc' }).success).toBe(false);
    expect(HotelSearchQuerySchema.safeParse({ city: 'x' }).success).toBe(false);
    expect(HotelSearchQuerySchema.safeParse({ city: 'del*hi' }).success).toBe(false);
    expect(HotelSearchQuerySchema.safeParse({}).success).toBe(false);
  });
});
