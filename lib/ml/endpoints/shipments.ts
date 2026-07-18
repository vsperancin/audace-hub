/**
 * Shipments endpoint — `/shipments/{id}`, `/shipments/{id}/labels`.
 *
 * @module @/lib/ml/endpoints/shipments
 */

import type { MercadoLivreClient } from '../client';
import type { MLShipment, MLShipmentLabel } from '../types';

/** Options for label generation. */
export interface MLShipmentLabelOptions {
  readonly format?: 'pdf' | 'zpl' | 'epl';
  readonly receiver_id?: number;
}

/** Body for updating shipment tracking. */
export interface MLShipmentTrackingUpdate {
  readonly tracking_number?: string;
  readonly service_id?: string;
  readonly carrier_id?: string | number;
  readonly tracking_method?: string;
}

/** Cost estimate request. */
export interface MLShipmentCostRequest {
  readonly dimensions: string;
  readonly listing_type_id: string;
  readonly quantity: number;
  readonly seller_address?: {
    readonly zip_code: string;
    readonly city?: { id: string };
    readonly state?: { id: string };
  };
  readonly buyer_address?: {
    readonly zip_code: string;
    readonly city?: { id: string };
    readonly state?: { id: string };
  };
}

/**
 * Shipments endpoint wrapper.
 */
export class ShipmentsEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Fetch a single shipment by id.
   */
  public async get(shipmentId: number): Promise<MLShipment> {
    return this.client.get<MLShipment>(`/shipments/${shipmentId}`);
  }

  /**
   * Fetch multiple shipments in one call.
   */
  public async getMany(shipmentIds: number[]): Promise<MLShipment[]> {
    if (shipmentIds.length === 0) return [];
    return this.client.get<MLShipment[]>(`/shipments`, {
      ids: shipmentIds.join(','),
    });
  }

  /**
   * Update shipment tracking number / carrier.
   */
  public async update(
    shipmentId: number,
    body: MLShipmentTrackingUpdate
  ): Promise<MLShipment> {
    return this.client.put<MLShipment>(`/shipments/${shipmentId}`, body);
  }

  /**
   * Get the available shipping services for a shipment.
   */
  public async availableServices(
    shipmentId: number
  ): Promise<unknown[]> {
    return this.client.get<unknown[]>(
      `/shipments/${shipmentId}/available_services`
    );
  }

  /**
   * Generate a shipping label (PDF or ZPL/EPL).
   *
   * Returns label metadata including the URL where the label can be
   * downloaded.
   */
  public async generateLabel(
    shipmentId: number,
    options: MLShipmentLabelOptions = {}
  ): Promise<MLShipmentLabel[]> {
    const body: Record<string, unknown> = {};
    if (options.format) body.format = options.format;
    if (options.receiver_id !== undefined) body.receiver_id = options.receiver_id;
    return this.client.post<MLShipmentLabel[]>(
      `/shipments/${shipmentId}/labels`,
      body
    );
  }

  /**
   * Cancel a shipment.
   */
  public async cancel(shipmentId: number): Promise<MLShipment> {
    return this.client.put<MLShipment>(`/shipments/${shipmentId}`, {
      status: 'cancelled',
    });
  }

  /**
   * Mark a shipment as delivered (for custom logistics).
   */
  public async markAsDelivered(shipmentId: number): Promise<MLShipment> {
    return this.client.post<MLShipment>(`/shipments/${shipmentId}/delivered`);
  }

  /**
   * Get shipping cost estimate for a hypothetical shipment.
   */
  public async estimateCost(
    itemId: string,
    quantity: number,
    zipCode: string,
    dimensions: string
  ): Promise<unknown> {
    return this.client.get(`/items/${itemId}/shipping_cost`, {
      quantity,
      zip_code: zipCode,
      dimensions,
    });
  }

  /**
   * List shipping notifications for the authenticated user.
   */
  public async notifications(
    userId: number,
    filters: { status?: string; offset?: number; limit?: number } = {}
  ): Promise<unknown> {
    return this.client.get(`/users/${userId}/shipping_notifications`, {
      status: filters.status,
      offset: filters.offset ?? 0,
      limit: filters.limit ?? 50,
    });
  }
}