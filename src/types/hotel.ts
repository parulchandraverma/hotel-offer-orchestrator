export const SUPPLIERS = ['supplierA', 'supplierB'] as const;
export type SupplierName = (typeof SUPPLIERS)[number];

export interface SupplierOffer {
  supplier: SupplierName;
  supplierHotelId: string;
  name: string;
  city: string;
  price: number;
  commissionPct: number;
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  price: number;
  commissionPct: number;
  supplier: SupplierName;
}

export type SupplierStatus = 'ok' | 'failed';

export interface OffersMeta {
  city: string;
  degraded: boolean;
  failedSuppliers: SupplierName[];
  suppliers: Record<SupplierName, { status: SupplierStatus; offers: number; error?: string }>;
  fetchedAt: string;
}

export interface CityOffers {
  hotels: Hotel[];
  meta: OffersMeta;
}

export interface PriceRange {
  min: number | '-inf';
  max: number | '+inf';
}

export interface HotelSearchQuery {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface HotelSearchResponse {
  data: Hotel[];
  meta: OffersMeta & {
    source: 'cache' | 'live';
    count: number;
    filters: { minPrice: number | null; maxPrice: number | null };
  };
}
