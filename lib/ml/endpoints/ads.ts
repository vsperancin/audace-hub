/**
 * Advertising endpoint — `/advertising/{advertiser_id}` and the
 * `/advertising/{advertiser_id}/campaigns` subresources.
 *
 * @module @/lib/ml/endpoints/ads
 */

import type { MercadoLivreClient } from '../client';
import type {
  MLAdCampaign,
  MLAdCampaignSearchFilters,
  MLAdvertiser,
  MLSearchResponse,
} from '../types';

/** Campaign search response envelope. */
export type MLAdCampaignSearchResponse = MLSearchResponse<MLAdCampaign>;

/** Body for creating a new campaign. */
export interface MLAdCampaignCreate {
  readonly name: string;
  readonly type: string;
  readonly start_date: string;
  readonly end_date?: string;
  readonly daily_budget: number;
  readonly total_budget?: number;
  readonly objectives?: MLAdCampaign['objectives'];
  readonly audience_id?: number;
  readonly item_ids?: string[];
  readonly channels?: string[];
}

/**
 * Advertising endpoint wrapper.
 */
export class AdsEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Return advertiser info for the given user id.
   */
  public async advertiser(advertiserId: number): Promise<MLAdvertiser> {
    return this.client.get<MLAdvertiser>(`/advertising/${advertiserId}`);
  }

  /**
   * List all campaigns for an advertiser (paginated).
   */
  public async listCampaigns(
    advertiserId: number,
    filters: MLAdCampaignSearchFilters = {}
  ): Promise<MLAdCampaignSearchResponse> {
    return this.client.get<MLAdCampaignSearchResponse>(
      `/advertising/${advertiserId}/campaigns/search`,
      sanitizeFilters(filters)
    );
  }

  /**
   * Fetch ALL campaigns for an advertiser, auto-paginating.
   */
  public async listAllCampaigns(
    advertiserId: number,
    filters: MLAdCampaignSearchFilters = {},
    options: { maxItems?: number; pageSize?: number } = {}
  ): Promise<MLAdCampaign[]> {
    return this.client.withPagination<MLAdCampaignSearchResponse, MLAdCampaign>(
      async ({ offset, limit }) => {
        return this.listCampaigns(advertiserId, {
          ...filters,
          offset,
          limit,
        });
      },
      { maxItems: options.maxItems, pageSize: options.pageSize }
    );
  }

  /**
   * Fetch a single campaign.
   */
  public async getCampaign(
    advertiserId: number,
    campaignId: number
  ): Promise<MLAdCampaign> {
    return this.client.get<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns/${campaignId}`
    );
  }

  /**
   * Create a new campaign.
   */
  public async createCampaign(
    advertiserId: number,
    body: MLAdCampaignCreate
  ): Promise<MLAdCampaign> {
    return this.client.post<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns`,
      body
    );
  }

  /**
   * Update a campaign.
   */
  public async updateCampaign(
    advertiserId: number,
    campaignId: number,
    body: Partial<MLAdCampaignCreate>
  ): Promise<MLAdCampaign> {
    return this.client.put<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns/${campaignId}`,
      body
    );
  }

  /**
   * Pause an active campaign.
   */
  public async pauseCampaign(
    advertiserId: number,
    campaignId: number
  ): Promise<MLAdCampaign> {
    return this.client.put<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns/${campaignId}`,
      { status: 'paused' }
    );
  }

  /**
   * Resume a paused campaign.
   */
  public async resumeCampaign(
    advertiserId: number,
    campaignId: number
  ): Promise<MLAdCampaign> {
    return this.client.put<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns/${campaignId}`,
      { status: 'active' }
    );
  }

  /**
   * Delete a campaign.
   */
  public async deleteCampaign(
    advertiserId: number,
    campaignId: number
  ): Promise<void> {
    await this.client.delete<void>(
      `/advertising/${advertiserId}/campaigns/${campaignId}`
    );
  }

  /**
   * Attach one or more items to a campaign.
   */
  public async addItemsToCampaign(
    advertiserId: number,
    campaignId: number,
    itemIds: string[]
  ): Promise<MLAdCampaign> {
    return this.client.post<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns/${campaignId}/items`,
      { item_ids: itemIds }
    );
  }

  /**
   * Detach an item from a campaign.
   */
  public async removeItemFromCampaign(
    advertiserId: number,
    campaignId: number,
    itemId: string
  ): Promise<MLAdCampaign> {
    return this.client.delete<MLAdCampaign>(
      `/advertising/${advertiserId}/campaigns/${campaignId}/items/${itemId}`
    );
  }

  /**
   * Fetch aggregated performance metrics for an advertiser over a date range.
   */
  public async metrics(
    advertiserId: number,
    dateFrom: Date,
    dateTo: Date,
    filters: { item_id?: string; campaign_id?: number } = {}
  ): Promise<unknown> {
    const params: Record<string, string | number> = {
      date_from: dateFrom.toISOString().slice(0, 10),
      date_to: dateTo.toISOString().slice(0, 10),
    };
    if (filters.item_id) params.item_id = filters.item_id;
    if (filters.campaign_id !== undefined) params.campaign_id = filters.campaign_id;
    return this.client.get(`/advertising/${advertiserId}/metrics`, params);
  }
}

function sanitizeFilters(
  filters: MLAdCampaignSearchFilters
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      out[key] = value;
    }
  }
  return out;
}