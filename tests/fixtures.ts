import type { SupplierName, SupplierOffer } from '../src/types/hotel';

export const offer = (supplier: SupplierName, name: string, price: number, commissionPct: number, city = 'delhi'): SupplierOffer => ({
  supplier,
  supplierHotelId: `${supplier}-${name}`,
  name,
  city,
  price,
  commissionPct,
});
