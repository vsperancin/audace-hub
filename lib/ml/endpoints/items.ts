/**
 * Items endpoint — `/items`, `/items/{id}`, `/items/search`,
 * `/users/{id}/items/search`, `/categories/{id}/items`.
 *
 * @module @/lib/ml/endpoints/items
 */

import type { MercadoLivreClient } from '../client';
import type {
  MLItem,
  MLItemSearchFilters,
  MLItemVariation,
  MLSearchResponse,
} from '../types';

/** Compact item summary used in listings and search. */
export interface MLItemSummary {
  readonly id: string;
  readonly title: string;
  readonly price?: number;
  readonly currency_id?: string;
  readonly thumbnail?: string;
  readonly condition?: string;
  readonly status?: string;
}

/** Multi-get request body. */
export interface MLItemMultiGetRequest {
  readonly ids: string[];
  /** Optional fields to include. */
  readonly attributes?: string[];
}

/**
 * Items endpoint wrapper.
 */
export class ItemsEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Fetch a single item by id.
   */
  public async get(itemId: string): Promise<MLItem> {
    return this.client.get<MLItem>(`/items/${itemId}`);
  }

  /**
   * Fetch a batch of items in a single request (max 20 ids per call).
   *
   * ML returns a `200` with a list of items, or a `404` with an array
   * of `{ code, id, error }` for missing IDs. We normalise the response
   * shape by reading whatever ML returns.
   */
  public async getMany(ids: string[]): Promise<MLItem[]> {
    if (ids.length === 0) return [];
    if (ids.length > 20) {
      // ML's multi-get caps at 20 — chunk automatically.
      const chunks: MLItem[][] = [];
      for (let i = 0; i < ids.length; i += 20) {
        // eslint-disable-next-line no-await-in-loop
        const part = await this.getMany(ids.slice(i, i + 20));
        chunks.push(part);
      }
      return chunks.flat();
    }

    type MLItemMultiResponse = MLItem[] | { codes?: Array<{ id: string; code: string }> };
    const response = await this.client.get<MLItemMultiResponse>('/items', {
      ids: ids.join(','),
    });
    if (Array.isArray(response)) return response;
    return [];
  }

  /**
   * Fetch the variations of a given item.
   */
  public async getVariations(itemId: string): Promise<MLItemVariation[]> {
    return this.client.get<MLItemVariation[]>(`/items/${itemId}/variations`);
  }

  /**
   * Update an item. Returns the updated item.
   */
  public async update(
    itemId: string,
    patch: Partial<MLItem>
  ): Promise<MLItem> {
    return this.client.put<MLItem>(`/items/${itemId}`, patch);
  }

  /**
   * Patch individual fields of an item.
   */
  public async patch(
    itemId: string,
    fields: Partial<MLItem>
  ): Promise<MLItem> {
    return this.client.patch<MLItem>(`/items/${itemId}`, fields);
  }

  /**
   * Relist a closed item.
   */
  public async relist(
    itemId: string,
    body: {
      readonly listing_type_id?: string;
      readonly price?: number;
      readonly quantity?: number;
    } = {}
  ): Promise<MLItem> {
    return this.client.post<MLItem>(`/items/${itemId}/relist`, body);
  }

  /**
   * Close (end) an active listing.
   */
  public async close(itemId: string): Promise<MLItem> {
    return this.client.post<MLItem>(`/items/${itemId}/close`);
  }

  /**
   * Pause a listing without closing it.
   */
  public async pause(itemId: string): Promise<MLItem> {
    return this.client.put<MLItem>(`/items/${itemId}`, { status: 'paused' });
  }

  /**
   * Resume a paused listing.
   */
  public async resume(itemId: string): Promise<MLItem> {
    return this.client.put<MLItem>(`/items/${itemId}`, { status: 'active' });
  }

  /**
   * Delete a listing.
   */
  public async delete(itemId: string): Promise<void> {
    await this.client.delete<void>(`/items/${itemId}`);
  }

  /**
   * Search items globally (`/sites/{site_id}/search`).
   *
   * For seller-scoped item search, use {@link searchBySeller}.
   */
  public async search(
    siteId: string,
    filters: MLItemSearchFilters = {}
  ): Promise<MLSearchResponse<MLItemSummary>> {
    return this.client.get<MLSearchResponse<MLItemSummary>>(
      `/sites/${siteId}/search`,
      sanitizeFilters(filters)
    );
  }

  /**
   * Search items belonging to a specific seller.
   *
   * Returns only IDs (string array) — for full item data, use
   * {@link getMany} with the IDs.
   */
  public async searchBySeller(
    sellerId: number,
    filters: UserItemsFilters = {}
  ): Promise<string[]> {
    const params: Record<string, string | number> = {
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
    if (filters.status) params.status = filters.status;
    if (filters.order) params.order = filters.order;

    return this.client.get<string[]>(`/users/${sellerId}/items/search`, params);
  }

  /**
   * Fetch ALL items belonging to a seller, paginating through the
   * entire list automatically. Use with care on sellers with many
   * listings — bound via `maxItems`.
   */
  public async listAllBySeller(
    sellerId: number,
    filters: UserItemsFilters = {},
    options: { maxItems?: number; pageSize?: number } = {}
  ): Promise<string[]> {
    return this.client.withPagination<string[], string>(
      async ({ offset, limit }) => {
        return this.searchBySeller(sellerId, {
          ...filters,
          offset,
          limit,
        });
      },
      { maxItems: options.maxItems, pageSize: options.pageSize }
    );
  }
}

/** UserItemsFilters re-exported for convenience. */
export interface UserItemsFilters {
  readonly status?: 'active' | 'paused' | 'closed';
  readonly order?: 'start_time_desc' | 'start_time_asc' | 'price_desc' | 'price_asc';
  readonly limit?: number;
  readonly offset?: number;
  readonly [k: string]: string | number | undefined;
}

/** Strip undefined/null values from filters for URLSearchParams cleanliness. */
function sanitizeFilters(
  filters: MLItemSearchFilters
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.join(',');
      continue;
    }
    out[key] = value as string | number;
  }
  return out;
}