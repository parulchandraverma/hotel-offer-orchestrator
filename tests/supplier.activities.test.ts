jest.mock('@temporalio/activity', () => {
  const actual = jest.requireActual('@temporalio/common');
  return { ApplicationFailure: actual.ApplicationFailure, log: { debug: jest.fn() } };
});

import { ApplicationFailure } from '@temporalio/common';
import { createSupplierActivities } from '../src/activities/supplier.activities';

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe('supplier activities', () => {
  it('maps supplier A and B payloads into the common offer shape', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request) =>
      String(url).includes('supplierA')
        ? json(200, { hotels: [{ hotelId: 'A1', name: 'Taj', price: 100, commissionPct: 10 }] })
        : json(200, { results: [{ id: 'B1', hotelName: 'TAJ', rate: 90, commission: 8 }] }),
    ) as unknown as typeof fetch;
    const acts = createSupplierActivities({ baseUrl: 'http://x', timeoutMs: 100, fetchImpl });

    expect(await acts.fetchSupplierA('delhi')).toEqual([
      { supplier: 'supplierA', supplierHotelId: 'A1', name: 'Taj', city: 'delhi', price: 100, commissionPct: 10 },
    ]);
    expect(await acts.fetchSupplierB('delhi')).toEqual([
      { supplier: 'supplierB', supplierHotelId: 'B1', name: 'TAJ', city: 'delhi', price: 90, commissionPct: 8 },
    ]);
  });

  it('5xx is retryable, 4xx is non-retryable', async () => {
    const make = (status: number) =>
      createSupplierActivities({ baseUrl: 'http://x', timeoutMs: 100, fetchImpl: (async () => json(status, {})) as unknown as typeof fetch });

    const e5 = await make(503).fetchSupplierA('delhi').catch((e: unknown) => e);
    expect(e5).toBeInstanceOf(ApplicationFailure);
    expect((e5 as ApplicationFailure).nonRetryable).toBe(false);

    const e4 = await make(400).fetchSupplierA('delhi').catch((e: unknown) => e);
    expect((e4 as ApplicationFailure).nonRetryable).toBe(true);
    expect((e4 as ApplicationFailure).type).toBe('SupplierBadRequest');
  });

  it('rejects malformed supplier payloads', async () => {
    const acts = createSupplierActivities({
      baseUrl: 'http://x',
      timeoutMs: 100,
      fetchImpl: (async () => json(200, { hotels: [{ name: 'no price' }] })) as unknown as typeof fetch,
    });
    await expect(acts.fetchSupplierA('delhi')).rejects.toThrow();
  });
});
