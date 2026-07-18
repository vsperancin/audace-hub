/**
 * Orders endpoint — `/orders`, `/orders/{id}`, `/orders/search`.
 *
 * @module @/lib/ml/endpoints/orders
 */

import type { MercadoLivreClient } from '../client';
import type {
  MLSearchResponse,
  MLOrder,
  MLOrderStatus,
  OrderSearchFilters,
} from '../types';

/** Result of an order search — full paging envelope. */
export type MLOrderSearchResponse = MLSearchResponse<MLOrder>;

/**
 * Orders endpoint wrapper.
 */
export class OrdersEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Fetch a single order by id.
   */
  public async get(orderId: number): Promise<MLOrder> {
    return this.client.get<MLOrder>(`/orders/${orderId}`);
  }

  /**
   * Fetch multiple orders by id (comma-separated).
   *
   * Returns a `{ results: MLOrder[] }` envelope (ML's compact form).
   */
  public async getMany(orderIds: number[]): Promise<{ results: MLOrder[] }> {
    if (orderIds.length === 0) return { results: [] };
    const response = await this.client.get<{ results: MLOrder[] }>(`/orders`, {
      ids: orderIds.join(','),
    });
    return response ?? { results: [] };
  }

  /**
   * Search orders with rich filters.
   *
   * Filters are passed as-is to the ML API, with one ergonomic
   * extension: `Date` objects in date-range fields are converted to
   * ISO 8601 strings before being sent.
   */
  public async search(
    sellerId: number,
    filters: OrderSearchFilters = {}
  ): Promise<MLOrderSearchResponse> {
    const params = buildOrderSearchParams(sellerId, filters);
    return this.client.get<MLOrderSearchResponse>('/orders/search', params);
  }

  /**
   * Search orders and auto-paginate until `maxItems` results are
   * collected (default: all).
   */
  public async searchAll(
    sellerId: number,
    filters: OrderSearchFilters = {},
    options: { maxItems?: number; pageSize?: number } = {}
  ): Promise<MLOrder[]> {
    return this.client.withPagination<MLOrderSearchResponse, MLOrder>(
      async ({ offset, limit }) => {
        return this.search(sellerId, { ...filters, offset, limit });
      },
      { maxItems: options.maxItems, pageSize: options.pageSize }
    );
  }

  /**
   * Convenience: fetch orders in a single status updated since `dateFrom`.
   */
  public async recentByStatus(
    sellerId: number,
    status: MLOrderStatus,
    dateFrom: Date,
    options: { maxItems?: number } = {}
  ): Promise<MLOrder[]> {
    return this.searchAll(
      sellerId,
      {
        'order.status': status,
        'order.date_last_updated.from': dateFrom,
        sort: { field: 'date_last_updated', direction: 'desc' },
      },
      options
    );
  }

  /**
   * Update shipping tracking number on an order.
   */
  public async updateShipping(
    orderId: number,
    body: { tracking_number?: string; service_id?: string }
  ): Promise<MLOrder> {
    return this.client.put<MLOrder>(`/orders/${orderId}/shipment`, body);
  }

  /**
   * Add a note to an order (visible to buyer).
   */
  public async addNote(orderId: number, note: string): Promise<unknown> {
    return this.client.post(`/orders/${orderId}/notes`, { note });
  }

  /**
   * Cancel an order (seller-side).
   */
  public async cancel(orderId: number, reason: string): Promise<MLOrder> {
    return this.client.put<MLOrder>(`/orders/${orderId}`, {
      status: 'cancelled',
      cancellation_reason: reason,
    });
  }

  /**
   * Mark an order as handled (seller confirms they will handle it).
   */
  public async markAsHandled(orderId: number): Promise<MLOrder> {
    return this.client.put<MLOrder>(`/orders/${orderId}`, { status: 'handled' });
  }

  /**
   * Mark an order as ready_to_ship (seller has handed the parcel to
   * the carrier).
   */
  public async markAsReadyToShip(orderId: number): Promise<MLOrder> {
    return this.client.put<MLOrder>(`/orders/${orderId}`, { status: 'ready_to_ship' });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build the query params for `/orders/search`, converting Date objects
 * to ISO strings and joining array filters with commas.
 */
function buildOrderSearchParams(
  sellerId: number,
  filters: OrderSearchFilters
): Record<string, string | number> {
  const out: Record<string, string | number> = {
    seller: sellerId,
  };

  if (filters.limit !== undefined) out.limit = filters.limit;
  if (filters.offset !== undefined) out.offset = filters.offset;
  if (filters.sort) {
    out.sort = `${filters.sort.field},${filters.sort.direction}`;
  }

  // Filter names exactly as ML expects them.
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (key === 'limit' || key === 'offset' || key === 'sort') continue;

    if (value instanceof Date) {
      // ML expects ISO 8601 in 'order.X.from' / 'order.X.to' filters.
      out[key] = value.toISOString();
      continue;
    }

    if (Array.isArray(value)) {
      out[key] = value.join(',');
      continue;
    }

    if (typeof value === 'object') {
      // Sort object handled above.
      continue;
    }

    out[key] = value;
  }

  return out;
}