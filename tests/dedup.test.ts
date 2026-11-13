import { dedupeOffers, isBetterOffer, normalizeHotelName } from '../src/services/dedup';
import { offer } from './fixtures';

describe('normalizeHotelName', () => {
  it.each([
    ['The Leela Palace', 'the leela palace'],
    ['  the  LEELA   palace ', 'the leela palace'],
    ['Trident, Nariman Point', 'trident nariman point'],
    ['Café Royal', 'cafe royal'],
    ['Bloomrooms @ Link Road', 'bloomrooms link road'],
    ['Rose & Crown', 'rose and crown'],
  ])('%s -> %s', (input, expected) => expect(normalizeHotelName(input)).toBe(expected));
});

describe('dedupeOffers', () => {
  it('keeps the cheapest offer for the same (normalised) hotel', () => {
    const result = dedupeOffers([offer('supplierA', 'The Leela Palace', 14500, 12), offer('supplierB', 'the leela  palace', 13900, 10)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'the-leela-palace', price: 13900, supplier: 'supplierB' });
  });

  it('on equal price, higher commission wins (regardless of input order)', () => {
    const a = offer('supplierA', 'Taj Palace', 11800, 10);
    const b = offer('supplierB', 'TAJ PALACE', 11800, 13);
    expect(dedupeOffers([a, b])[0]).toMatchObject({ supplier: 'supplierB', commissionPct: 13 });
    expect(dedupeOffers([b, a])[0]).toMatchObject({ supplier: 'supplierB', commissionPct: 13 });
  });

  it('full tie (price + commission) is resolved deterministically', () => {
    const a = offer('supplierA', 'The Oberoi', 18900, 15);
    const b = offer('supplierB', 'The Oberoi', 18900, 15);
    expect(dedupeOffers([b, a])[0]!.supplier).toBe('supplierA');
    expect(dedupeOffers([a, b])[0]!.supplier).toBe('supplierA');
  });

  it('a cheaper offer beats a higher commission', () => {
    expect(isBetterOffer(offer('supplierB', 'X', 100, 1), offer('supplierA', 'X', 101, 50))).toBe(true);
  });

  it('returns hotels sorted by price and drops invalid rows', () => {
    const result = dedupeOffers([
      offer('supplierA', 'C', 300, 5),
      offer('supplierA', 'A', 100, 5),
      offer('supplierB', 'B', 200, 5),
      offer('supplierB', 'Bad', Number.NaN, 5),
      offer('supplierB', 'Neg', -1, 5),
      offer('supplierB', '  ', 50, 5),
    ]);
    expect(result.map((h) => h.price)).toEqual([100, 200, 300]);
  });

  it('handles empty input', () => expect(dedupeOffers([])).toEqual([]));
});
