import type { FastifyInstance } from 'fastify';
import type { HotelService } from '../services/hotel.service';
import { HotelSearchQuerySchema } from './schemas';

export async function hotelRoutes(app: FastifyInstance, opts: { hotelService: HotelService }): Promise<void> {
  app.get('/api/hotels', async (req, reply) => {
    const query = HotelSearchQuerySchema.parse(req.query);
    const result = await opts.hotelService.search(query);
    reply.header('x-cache', result.meta.source === 'cache' ? 'HIT' : 'MISS');
    if (result.meta.degraded) reply.header('x-degraded', result.meta.failedSuppliers.join(','));
    return result;
  });
}
