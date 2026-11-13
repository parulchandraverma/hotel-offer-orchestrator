import type { Hotel, PriceRange } from '../types/hotel';

export function toScoreRange(minPrice?: number, maxPrice?: number): PriceRange {
  return {
    min: minPrice ?? '-inf',
    max: maxPrice ?? '+inf',
  };
}

export const isUnbounded = (r: PriceRange): boolean => r.min === '-inf' && r.max === '+inf';

// same inclusive bounds as ZRANGEBYSCORE, used on live results
export function filterByRange(hotels: readonly Hotel[], r: PriceRange): Hotel[] {
  if (isUnbounded(r)) return [...hotels];
  return hotels.filter((h) => (r.min === '-inf' || h.price >= r.min) && (r.max === '+inf' || h.price <= r.max));
}
