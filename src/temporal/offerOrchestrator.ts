import { ApplicationFailure, WorkflowFailedError, type Client } from '@temporalio/client';
import { UpstreamUnavailableError } from '../lib/errors';
import type { CityOffers } from '../types/hotel';
import { hotelOffersWorkflow } from '../workflows/hotelOffers.workflow';

export interface OfferOrchestrator {
  fetchCityOffers(city: string): Promise<CityOffers>;
}

export class TemporalOfferOrchestrator implements OfferOrchestrator {
  constructor(
    private readonly client: Client,
    private readonly opts: { taskQueue: string; workflowTimeoutMs: number },
  ) {}

  async fetchCityOffers(city: string): Promise<CityOffers> {
    try {
      return await this.client.workflow.execute(hotelOffersWorkflow, {
        taskQueue: this.opts.taskQueue,
        args: [city],
        // same id per city: a second API instance joins the running workflow instead of starting another
        workflowId: `hotel-offers-${city}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowExecutionTimeout: this.opts.workflowTimeoutMs,
      });
    } catch (err) {
      if (err instanceof WorkflowFailedError && err.cause instanceof ApplicationFailure && err.cause.type === 'AllSuppliersFailed') {
        throw new UpstreamUnavailableError(err.cause.message, err.cause.details?.[0]);
      }
      throw err;
    }
  }
}
