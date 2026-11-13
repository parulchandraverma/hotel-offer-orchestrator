import { ApplicationFailure, log } from '@temporalio/activity';
import { z } from 'zod';
import type { SupplierName, SupplierOffer } from '../types/hotel';

const SupplierAResponse = z.object({
  hotels: z.array(z.object({ hotelId: z.string(), name: z.string(), price: z.number(), commissionPct: z.number() })),
});
const SupplierBResponse = z.object({
  results: z.array(z.object({ id: z.string(), hotelName: z.string(), rate: z.number(), commission: z.number() })),
});

export interface SupplierActivityDeps {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

async function getJson(deps: SupplierActivityDeps, supplier: SupplierName, city: string): Promise<unknown> {
  const url = `${deps.baseUrl}/${supplier}/hotels?city=${encodeURIComponent(city)}`;
  const res = await (deps.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(deps.timeoutMs) });
  if (res.status >= 400 && res.status < 500) {
    // no point retrying a 4xx
    throw ApplicationFailure.nonRetryable(`${supplier} rejected request (${res.status})`, 'SupplierBadRequest');
  }
  if (!res.ok) throw ApplicationFailure.retryable(`${supplier} responded ${res.status}`, 'SupplierUnavailable');
  return res.json();
}

export function createSupplierActivities(deps: SupplierActivityDeps) {
  return {
    async fetchSupplierA(city: string): Promise<SupplierOffer[]> {
      const body = SupplierAResponse.parse(await getJson(deps, 'supplierA', city));
      log.debug('supplierA fetched', { city, count: body.hotels.length });
      return body.hotels.map((h) => ({
        supplier: 'supplierA',
        supplierHotelId: h.hotelId,
        name: h.name,
        city,
        price: h.price,
        commissionPct: h.commissionPct,
      }));
    },

    async fetchSupplierB(city: string): Promise<SupplierOffer[]> {
      const body = SupplierBResponse.parse(await getJson(deps, 'supplierB', city));
      log.debug('supplierB fetched', { city, count: body.results.length });
      return body.results.map((h) => ({
        supplier: 'supplierB',
        supplierHotelId: h.id,
        name: h.hotelName,
        city,
        price: h.rate,
        commissionPct: h.commission,
      }));
    },
  };
}

export type SupplierActivities = ReturnType<typeof createSupplierActivities>;
