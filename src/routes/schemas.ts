import { z } from 'zod';

const price = z.coerce.number().int().nonnegative().max(10_000_000);

export const HotelSearchQuerySchema = z
  .object({
    city: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z .-]{1,49}$/, 'city must be 2-50 letters'),
    minPrice: price.optional(),
    maxPrice: price.optional(),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice must be <= maxPrice',
    path: ['minPrice'],
  });

export type HotelSearchQueryInput = z.infer<typeof HotelSearchQuerySchema>;
