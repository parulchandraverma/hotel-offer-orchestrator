// A and B use different field names on purpose. Some hotels overlap with different casing/spacing.

export interface SupplierARow { hotelId: string; name: string; price: number; commissionPct: number }
export interface SupplierBRow { id: string; hotelName: string; rate: number; commission: number }

export const SUPPLIER_A_DATA: Record<string, SupplierARow[]> = {
  delhi: [
    { hotelId: 'A-DEL-1', name: 'The Leela Palace', price: 14500, commissionPct: 12 },
    { hotelId: 'A-DEL-2', name: 'Taj Palace', price: 11800, commissionPct: 10 },
    { hotelId: 'A-DEL-3', name: 'Hotel Pride Plaza', price: 5200, commissionPct: 8 },
    { hotelId: 'A-DEL-4', name: 'Radisson Blu Dwarka', price: 6900, commissionPct: 9 },
    { hotelId: 'A-DEL-5', name: 'Bloomrooms @ Link Road', price: 3200, commissionPct: 6 },
    { hotelId: 'A-DEL-6', name: 'The Oberoi', price: 18900, commissionPct: 15 },
  ],
  mumbai: [
    { hotelId: 'A-BOM-1', name: 'Trident Nariman Point', price: 13200, commissionPct: 11 },
    { hotelId: 'A-BOM-2', name: 'Ibis Mumbai Airport', price: 4100, commissionPct: 7 },
    { hotelId: 'A-BOM-3', name: 'ITC Maratha', price: 12500, commissionPct: 12 },
  ],
  bangalore: [
    { hotelId: 'A-BLR-1', name: 'The Oberoi Bengaluru', price: 15800, commissionPct: 14 },
    { hotelId: 'A-BLR-2', name: 'Lemon Tree Premier', price: 5600, commissionPct: 8 },
  ],
};

export const SUPPLIER_B_DATA: Record<string, SupplierBRow[]> = {
  delhi: [
    { id: 'B-9001', hotelName: 'the leela  palace', rate: 13900, commission: 10 },
    { id: 'B-9002', hotelName: 'TAJ PALACE', rate: 11800, commission: 13 }, // same price as A, higher commission
    { id: 'B-9003', hotelName: 'Hotel Pride Plaza', rate: 5600, commission: 9 },
    { id: 'B-9004', hotelName: 'Holiday Inn Mayur Vihar', rate: 7400, commission: 9 },
    { id: 'B-9005', hotelName: 'Ginger Delhi Vivek Vihar', rate: 2800, commission: 5 },
    { id: 'B-9006', hotelName: 'The Oberoi', rate: 18900, commission: 15 }, // exact tie with A
  ],
  mumbai: [
    { id: 'B-7001', hotelName: 'Trident, Nariman Point', rate: 12800, commission: 10 },
    { id: 'B-7002', hotelName: 'Taj Lands End', rate: 15400, commission: 13 },
    { id: 'B-7003', hotelName: 'ITC Maratha', rate: 12500, commission: 14 },
  ],
  bangalore: [
    { id: 'B-5001', hotelName: 'Lemon Tree Premier', rate: 5400, commission: 7 },
    { id: 'B-5002', hotelName: 'Taj MG Road', rate: 10900, commission: 11 },
  ],
};
