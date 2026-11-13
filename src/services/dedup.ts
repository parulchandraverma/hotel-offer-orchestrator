import type { Hotel, SupplierOffer } from '../types/hotel';

// Runs inside the workflow, so keep this file free of I/O and Node APIs.

export function normalizeHotelName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const hotelIdFromName = (normalizedName: string): string => normalizedName.replace(/ /g, '-');

// cheaper wins, then higher commission, then supplier name so the result is stable
export function isBetterOffer(candidate: SupplierOffer, current: SupplierOffer): boolean {
  if (candidate.price !== current.price) return candidate.price < current.price;
  if (candidate.commissionPct !== current.commissionPct) return candidate.commissionPct > current.commissionPct;
  return candidate.supplier < current.supplier;
}

export function dedupeOffers(offers: readonly SupplierOffer[]): Hotel[] {
  const best = new Map<string, SupplierOffer>();

  for (const offer of offers) {
    if (!Number.isFinite(offer.price) || offer.price < 0) continue;
    const key = normalizeHotelName(offer.name);
    if (!key) continue;
    const current = best.get(key);
    if (!current || isBetterOffer(offer, current)) best.set(key, offer);
  }

  const hotels: Hotel[] = [];
  for (const [key, o] of best) {
    hotels.push({
      id: hotelIdFromName(key),
      name: o.name.trim(),
      city: o.city,
      price: o.price,
      commissionPct: o.commissionPct,
      supplier: o.supplier,
    });
  }
  return hotels.sort((a, b) => a.price - b.price || b.commissionPct - a.commissionPct || a.id.localeCompare(b.id));
}
