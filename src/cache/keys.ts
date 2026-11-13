// {city} hash tag keeps all keys of a city in one cluster slot (MULTI works on Redis Cluster too)
export const cacheKeys = (city: string) => ({
  byPrice: `hotels:{${city}}:by_price`, // zset: hotelId -> price
  details: `hotels:{${city}}:details`, // hash: hotelId -> hotel json
  meta: `hotels:{${city}}:meta`,
  lock: `lock:hotels:{${city}}`,
});
