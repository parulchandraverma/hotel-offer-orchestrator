import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type { SupplierActivities } from '../activities/supplier.activities';
import type { CityOffers } from '../types/hotel';
import { aggregateOffers, AllSuppliersFailedError } from './aggregate';

const { fetchSupplierA, fetchSupplierB } = proxyActivities<SupplierActivities>({
  startToCloseTimeout: '2 seconds',
  scheduleToCloseTimeout: '7 seconds',
  retry: {
    initialInterval: '200 milliseconds',
    backoffCoefficient: 2,
    maximumInterval: '1 second',
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['SupplierBadRequest'],
  },
});

export async function hotelOffersWorkflow(city: string): Promise<CityOffers> {
  try {
    return await aggregateOffers(city, { supplierA: fetchSupplierA, supplierB: fetchSupplierB });
  } catch (err) {
    if (err instanceof AllSuppliersFailedError) {
      throw ApplicationFailure.nonRetryable(err.message, 'AllSuppliersFailed', err.failures);
    }
    throw err;
  }
}
