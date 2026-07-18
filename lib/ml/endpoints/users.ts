/**
 * Users endpoint — `/users/me`, `/users/{id}`.
 *
 * @module @/lib/ml/endpoints/users
 */

import type { MercadoLivreClient } from '../client';
import type { MLUser } from '../types';

/** Optional filters accepted by `/users/{id}/items/search`. */
export interface UserItemsFilters {
  readonly status?: 'active' | 'paused' | 'closed';
  readonly order?: 'start_time_desc' | 'start_time_asc' | 'price_desc' | 'price_asc';
  readonly limit?: number;
  readonly offset?: number;
  readonly [k: string]: string | number | undefined;
}

/**
 * Thin wrapper around user-related ML endpoints.
 */
export class UsersEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Return the authenticated user (`/users/me`).
   *
   * The ML API also exposes a couple of convenience aliases that are
   * equivalent: `/users/me` and `/users/{user_id}`.
   */
  public async me(): Promise<MLUser> {
    return this.client.get<MLUser>('/users/me');
  }

  /**
   * Return the public profile of a given user.
   */
  public async get(userId: number): Promise<MLUser> {
    return this.client.get<MLUser>(`/users/${userId}`);
  }

  /**
   * Return the IDs of items listed by the given user, with simple filters.
   *
   * For full item data, call {@link ItemsEndpoint.getMany} with the returned IDs.
   */
  public async listItemIds(
    userId: number,
    filters: UserItemsFilters = {}
  ): Promise<string[]> {
    const params: Record<string, string | number> = {
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
    if (filters.status) params.status = filters.status;
    if (filters.order) params.order = filters.order;

    return this.client.get<string[]>(`/users/${userId}/items/search`, params);
  }

  /**
   * Return the authenticated user's accepted payment methods.
   */
  public async acceptedPaymentMethods(userId: number): Promise<unknown> {
    return this.client.get(`/users/${userId}/accepted_payment_methods`);
  }

  /**
   * Return the authenticated user's available listing types.
   */
  public async availableListingTypes(userId: number): Promise<unknown> {
    return this.client.get(`/users/${userId}/available_listing_types`);
  }
}