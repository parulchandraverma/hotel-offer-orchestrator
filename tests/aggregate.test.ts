import { aggregateOffers, AllSuppliersFailedError, type SupplierFetchers } from '../src/workflows/aggregate';
import { offer } from './fixtures';

const fixedNow = () => new Date('2026-11-13T05:00:00.000Z');

/** Activities are mocked: the workflow logic receives them as plain async functions. */
const mockActivities = (a: jest.Mock, b: jest.Mock): SupplierFetchers => ({ supplierA: a, supplierB: b });

describe('aggregateOffers (workflow core, activities mocked)', () => {
  it('calls both suppliers in parallel and merges + dedupes', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = (rows: ReturnType<typeof offer>[]) =>
      jest.fn(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return rows;
      });
    const a = slow([offer('supplierA', 'Taj Palace', 11800, 10), offer('supplierA', 'Hotel Pride Plaza', 5200, 8)]);
    const b = slow([offer('supplierB', 'TAJ PALACE', 11800, 13)]);

    const res = await aggregateOffers('delhi', mockActivities(a, b), fixedNow);

    expect(maxInFlight).toBe(2); // truly parallel
    expect(a).toHaveBeenCalledWith('delhi');
    expect(b).toHaveBeenCalledWith('delhi');
    expect(res.hotels).toHaveLength(2);
    expect(res.hotels.find((h) => h.id === 'taj-palace')!.supplier).toBe('supplierB');
    expect(res.meta).toEqual({
      city: 'delhi',
      degraded: false,
      failedSuppliers: [],
      suppliers: { supplierA: { status: 'ok', offers: 2 }, supplierB: { status: 'ok', offers: 1 } },
      fetchedAt: '2026-11-13T05:00:00.000Z',
    });
  });

  it('degraded mode: supplier B fails -> continues with supplier A', async () => {
    const a = jest.fn().mockResolvedValue([offer('supplierA', 'The Leela Palace', 14500, 12)]);
    const b = jest.fn().mockRejectedValue(new Error('supplierB responded 503'));

    const res = await aggregateOffers('delhi', mockActivities(a, b), fixedNow);

    expect(res.hotels).toEqual([expect.objectContaining({ id: 'the-leela-palace', supplier: 'supplierA' })]);
    expect(res.meta.degraded).toBe(true);
    expect(res.meta.failedSuppliers).toEqual(['supplierB']);
    expect(res.meta.suppliers.supplierB).toEqual({ status: 'failed', offers: 0, error: 'supplierB responded 503' });
  });

  it('degraded mode surfaces the root cause of a Temporal ActivityFailure', async () => {
    const activityFailure = Object.assign(new Error('Activity task failed'), { cause: new Error('timeout after 2000ms') });
    const res = await aggregateOffers(
      'delhi',
      mockActivities(jest.fn().mockRejectedValue(activityFailure), jest.fn().mockResolvedValue([offer('supplierB', 'X', 1, 1)])),
      fixedNow,
    );
    expect(res.meta.failedSuppliers).toEqual(['supplierA']);
    expect(res.meta.suppliers.supplierA.error).toBe('timeout after 2000ms');
  });

  it('a supplier returning zero hotels is not a failure', async () => {
    const res = await aggregateOffers('goa', mockActivities(jest.fn().mockResolvedValue([]), jest.fn().mockResolvedValue([])));
    expect(res.hotels).toEqual([]);
    expect(res.meta.degraded).toBe(false);
  });

  it('throws AllSuppliersFailedError when every supplier fails', async () => {
    const p = aggregateOffers('delhi', mockActivities(jest.fn().mockRejectedValue(new Error('A down')), jest.fn().mockRejectedValue(new Error('B down'))));
    await expect(p).rejects.toBeInstanceOf(AllSuppliersFailedError);
    await expect(p).rejects.toMatchObject({ failures: { supplierA: 'A down', supplierB: 'B down' } });
  });
});
