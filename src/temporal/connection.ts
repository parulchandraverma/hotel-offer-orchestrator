import { Client, Connection } from '@temporalio/client';
import type { AppConfig } from '../config/env';

export async function createTemporalClient(config: AppConfig): Promise<{ client: Client; connection: Connection }> {
  const connection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
  const client = new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
  return { client, connection };
}
