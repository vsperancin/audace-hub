/**
 * TypeScript types for the Mercado Livre REST API.
 *
 * Mirrors the public API surface documented at
 * https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br
 *
 * Every type is exported as an `interface` (not a `type` alias) so
 * downstream consumers can extend or augment the shape via TypeScript
 * declaration merging if ML adds new fields.
 *
 * Field names follow ML's snake_case exactly — do not rename, the
 * client serialises/deserialises JSON without transformation.
 *
 * @module @/lib/ml/types
 */

// ============================================================================
// Common / shared
// ============================================================================

/** ISO 8601 timestamp string. */
export interface MLDate {
  /** ISO 8601 datetime, e.g. `2024-01-15T14:30:00.000-03:00`. */
  readonly date?: string;
  /** Localised timezone offset string, e.g. `-03:00`. */
  readonly timezone_type?: number;
  /** Timezone name, e.g. `America/Sao_Paulo`. */
  readonly timezone?: string;
}

/** Monetary amount with currency. */
export interface MLMoney {
  readonly amount: number;
  readonly currency_id: string;
}

/** Address used for shipping and billing. */
export interface MLAddress {
  readonly address_line: string;
  readonly city: { id: string; name: string };
  readonly state: { id: string; name: string };
  readonly country: { id: string; name: string };
  readonly zip_code: string;
  readonly street_name?: string;
  readonly street_number?: string;
  readonly apartment?: string;
  readonly comment?: string;
  readonly contact?: string;
  readonly phone?: string;
  readonly area_code?: string;
  readonly neighborhood?: { id: string; name: string };
  readonly municipality?: { id: string; name: string };
  readonly latitude?: number;
  readonly longitude?: number;
  readonly geolocation_type?: string;
  readonly agency?: string;
  readonly types?: string[];
  readonly delivery_preference?: string;
  readonly between_streets?: string[];
}

/** Pagination envelope returned by search endpoints. */
export interface MLPagination {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly primary_key?: string;
}

/** Generic search response wrapping results + paging metadata. */
export interface MLSearchResponse<T> {
  readonly results: T[];
  readonly paging: MLPagination;
  readonly sort?: Record<string, string>;
  readonly available_sorts?: Record<string, string>;
  readonly filters?: Array<{
    id: string;
    name: string;
    type: string;
    values: Array<{ id: string; name: string; results: number }>;
  }>;
}

/** Sort direction for search queries. */
export type MLSortDirection = 'asc' | 'desc';

/** Common sortable fields used across multiple search endpoints. */
export interface MLSort {
  readonly field: string;
  readonly direction: MLSortDirection;
}

// ============================================================================
// Users
// ============================================================================

/** Public user account information. */
export interface MLUser {
  readonly id: number;
  readonly nickname: string;
  readonly registration_date: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly email?: string;
  readonly identification?: {
    readonly type: string;
    readonly number: string;
  };
  readonly address?: MLAddress;
  readonly phone?: {
    readonly area_code: string;
    readonly number: string;
    readonly extension?: string;
    readonly verified?: boolean;
  };
  readonly alternative_phone?: {
    readonly area_code: string;
    readonly number: string;
    readonly extension?: string;
  };
  readonly company?: {
    readonly corporate_name: string;
    readonly brand_name?: string;
    readonly identification: {
      readonly type: string;
      readonly number: string;
    };
  };
  readonly credit?: {
    readonly consumption: {
      readonly total: number;
      readonly last_updated: string;
    };
    readonly credit_level_id: string;
  };
  readonly points: number;
  readonly permissions?: {
    readonly show_purchase_buttons: boolean;
    readonly immediate_payment: boolean;
    readonly credit_status: string;
    readonly mandatory_confirm_information: boolean;
  };
  readonly seller_experience?: string;
  readonly seller_reputation?: MLSellerReputation;
  readonly buyer_reputation?: MLBuyerReputation;
  readonly status?: {
    readonly site_status: string;
    readonly list?: {
      readonly allow: boolean;
      readonly codes: string[];
      readonly immediate_payment?: {
        readonly required: boolean;
        readonly reasons: string[];
      };
    };
    readonly buy?: {
      readonly allow: boolean;
      readonly codes: string[];
      readonly immediate_payment?: {
        readonly required: boolean;
        readonly reasons: string[];
      };
    };
    readonly sell?: {
      readonly allow: boolean;
      readonly codes: string[];
      readonly immediate_payment?: {
        readonly required: boolean;
        readonly reasons: string[];
      };
    };
    readonly billing?: {
      readonly allow: boolean;
      readonly codes: string[];
    };
    readonly mercadopago_account_type?: string;
    readonly mercadopago_tc_status?: string;
    readonly marketplace_admin?: string;
    readonly confirmed_email?: boolean;
    readonly user_type?: string;
    readonly required_action?: string | null;
  };
  readonly secure_email?: string;
  readonly tags?: string[];
  readonly context?: {
    readonly device: string;
    readonly source: string;
  };
  readonly country_id?: string;
  readonly site_id?: string;
  readonly logo?: string;
  readonly internal_tags?: string[];
  readonly kra?: number;
}

/** Seller reputation metrics. */
export interface MLSellerReputation {
  readonly level_id?: string;
  readonly power_seller_status?: string;
  readonly transactions?: {
    readonly period: string;
    readonly total: number;
    readonly completed: number;
    readonly canceled: number;
    readonly ratings: {
      readonly positive: number;
      readonly neutral: number;
      readonly negative: number;
    };
  };
  readonly metrics?: {
    readonly sales?: {
      readonly period: string;
      readonly completed: number;
    };
    readonly claims?: {
      readonly period: string;
      readonly value: number;
      readonly rate: number;
    };
    readonly delayed_handling_time?: {
      readonly period: string;
      readonly value: number;
      readonly rate: number;
    };
    readonly cancellations?: {
      readonly period: string;
      readonly value: number;
      readonly rate: number;
    };
  };
}

/** Buyer reputation metrics. */
export interface MLBuyerReputation {
  readonly level_id?: string;
  readonly power_buyer_status?: string;
  readonly transactions?: {
    readonly period: string;
    readonly total: number;
    readonly completed: number;
    readonly canceled: number;
    readonly ratings: {
      readonly positive: number;
      readonly neutral: number;
      readonly negative: number;
    };
  };
  readonly tags?: string[];
  readonly metrics?: {
    readonly purchases?: {
      readonly period: string;
      readonly total: number;
    };
    readonly cancellations?: {
      readonly period: string;
      readonly value: number;
      readonly rate: number;
    };
  };
}

// ============================================================================
// Items / Listings
// ============================================================================

/** Top-level item (listing) returned by `/items/{id}` and search. */
export interface MLItem {
  readonly id: string;
  readonly site_id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly seller_id: number;
  readonly category_id: string;
  readonly official_store_id?: number;
  readonly price: number;
  readonly base_price?: number;
  readonly original_price?: number;
  readonly currency_id: string;
  readonly initial_quantity: number;
  readonly available_quantity: number;
  readonly sold_quantity: number;
  readonly sale_terms: MLSaleTerm[];
  readonly buying_mode: string;
  readonly listing_type_id: string;
  readonly start_time?: string;
  readonly stop_time?: string;
  readonly end_time?: string;
  readonly expiration_time?: string;
  readonly condition: string;
  readonly permalink: string;
  readonly thumbnail: string;
  readonly secure_thumbnail: string;
  readonly pictures: MLPicture[];
  readonly video_id?: string;
  readonly descriptions: string[];
  readonly accepts_mercadopago: boolean;
  readonly non_mercado_pago_payment_methods: MLPaymentMethod[];
  readonly shipping: MLShippingSummary;
  readonly seller_address: MLSellerAddress;
  readonly seller_contact?: MLSellerContact;
  readonly location: MLELocation;
  readonly geolocation?: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly coverage_areas: string[];
  readonly attributes: MLAttribute[];
  readonly variations?: MLItemVariation[];
  readonly variation_filters?: string[];
  readonly tags: string[];
  readonly status: string;
  readonly sub_status?: string[];
  readonly warranty?: string;
  readonly catalog_product_id?: string;
  readonly domain_id?: string;
  readonly parent_item_id?: string;
  readonly health?: number | null;
  readonly catalog_listing?: boolean;
  readonly item_relations?: string[];
  readonly channels?: string[];
  readonly settings?: {
    readonly listing_strategy?: string;
    readonly automatic_relist?: boolean;
    readonly chronological_listing?: boolean;
    readonly seller_profile?: string;
  };
  readonly date_created?: string;
  readonly last_updated?: string;
}

/** Item picture metadata. */
export interface MLPicture {
  readonly id: string;
  readonly url: string;
  readonly secure_url: string;
  readonly size: string;
  readonly max_size: string;
  readonly quality: string;
}

/** Sale term (warranty, return policy, etc). */
export interface MLSaleTerm {
  readonly id: string;
  readonly name: string;
  readonly value_id?: string;
  readonly value_name: string;
  readonly value_struct?: {
    readonly number?: number;
    readonly unit?: string;
  };
  readonly values?: Array<{ id: string; name: string }>;
}

/** Non-MercadoPago payment method accepted on a listing. */
export interface MLPaymentMethod {
  readonly id: string;
  readonly description: string;
  readonly type: string;
}

/** Shipping summary embedded in item responses. */
export interface MLShippingSummary {
  readonly mode: string;
  readonly free_shipping: boolean;
  readonly logistic_type: string;
  readonly store_pick_up: boolean;
  readonly tags: string[];
  readonly promise?: {
    readonly type: string;
    readonly target?: {
      readonly type: string;
      readonly value?: string;
    };
    readonly start_date?: string;
    readonly end_date?: string;
  };
  readonly dimensions?: string | null;
}

/** Seller address on a listing. */
export interface MLSellerAddress {
  readonly id?: number;
  readonly comment?: string;
  readonly address_line: string;
  readonly zip_code: string;
  readonly city: { id: string; name: string };
  readonly state: { id: string; name: string };
  readonly country: { id: string; name: string };
  readonly latitude?: number;
  readonly longitude?: number;
  readonly types?: string[];
}

/** Seller contact info embedded in some item responses. */
export interface MLSellerContact {
  readonly contact: string;
  readonly other_info?: string;
  readonly area_code: string;
  readonly phone: string;
  readonly area_code2?: string;
  readonly phone2?: string;
  readonly email?: string;
  readonly webpage?: string;
}

/** Location embedded in item responses (legacy alias of seller_address). */
export interface MLELocation {
  readonly address_line: string;
  readonly zip_code: string;
  readonly city: { id: string; name: string };
  readonly state: { id: string; name: string };
  readonly country: { id: string; name: string };
  readonly latitude?: number;
  readonly longitude?: number;
  readonly neighborhood?: { id: string; name: string };
  readonly municipality?: { id: string; name: string };
}

/** Item attribute (e.g. brand, model, color). */
export interface MLAttribute {
  readonly id: string;
  readonly name: string;
  readonly value_id?: string | null;
  readonly value_name: string | null;
  readonly value_struct?: {
    readonly number?: number;
    readonly unit?: string;
  } | null;
  readonly values?: Array<{ id: string; name: string }>;
  readonly attribute_group_id?: string;
  readonly attribute_group_name?: string;
  readonly source?: number;
  readonly tags?: {
    readonly hidden?: boolean;
    readonly variation_attribute?: boolean;
    readonly multivalued?: boolean;
    readonly required?: boolean;
    readonly read_only?: boolean;
    readonly catalog_required?: boolean;
    readonly conditional_required?: boolean;
    readonly allow_filtering?: boolean;
    readonly suggest?: boolean;
    readonly fixed?: boolean;
  };
}

/** Item variation (size/color SKU within a parent listing). */
export interface MLItemVariation {
  readonly id: number;
  readonly price: number;
  readonly attribute_combinations: MLAttribute[];
  readonly available_quantity: number;
  readonly sold_quantity: number;
  readonly sale_terms?: MLSaleTerm[];
  readonly picture_ids?: string[];
  readonly seller_custom_field?: string;
  readonly catalog_product_id?: string;
  readonly inventory_id?: string;
  readonly user_product_id?: string;
  readonly barcode?: string;
  readonly thumbnail?: string;
  readonly title?: string;
  readonly condition?: string;
  readonly currency_id?: string;
  readonly variation_id?: number;
  readonly parent_item_id?: string;
}

// ============================================================================
// Orders
// ============================================================================

/** Order status as exposed by ML. */
export type MLOrderStatus =
  | 'confirmed'
  | 'payment_required'
  | 'payment_in_process'
  | 'partially_paid'
  | 'paid'
  | 'partially_refunded'
  | 'pending'
  | 'cancelled'
  | 'invalid'
  | 'onhold'
  | 'returned'
  | 'closed'
  | 'handled'
  | 'shipped'
  | 'delivered'
  | 'ready_to_ship';

/** Order (a.k.a. `Order` in the JSON envelope). */
export interface MLOrder {
  readonly id: number;
  readonly status: MLOrderStatus;
  readonly status_detail?: string | null;
  readonly date_created: string;
  readonly date_closed?: string;
  readonly date_last_updated?: string;
  readonly date_ready_to_ship?: string | null;
  readonly expiration_date?: string;
  readonly order_items: MLOrderItem[];
  readonly total_amount: number;
  readonly currency_id: string;
  readonly buyer: MLOrderParty;
  readonly seller: MLOrderParty;
  readonly payments: MLPayment[];
  readonly shipping: MLOrderShipping;
  readonly tags: string[];
  readonly pack_id?: number;
  readonly pickup_id?: number | null;
  readonly mediations?: MLMediation[];
  readonly claims?: MLClaim[];
  readonly returns?: MLReturn[];
  readonly fulfilled?: boolean | null;
  readonly manufacturing_ending_date?: string | null;
  readonly feedback?: {
    readonly buyer?: MLFeedback;
    readonly seller?: MLFeedback;
  };
  readonly context?: {
    readonly channel: string;
    readonly source?: Record<string, string>;
    readonly flow?: string;
  };
}

/** Buyer or seller summary as embedded in an order. */
export interface MLOrderParty {
  readonly id: number;
  readonly nickname: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly email?: string;
  readonly phone?: {
    readonly area_code: string;
    readonly number: string;
    readonly extension?: string;
  };
  readonly identification?: {
    readonly type: string;
    readonly number: string;
  };
  readonly billing_info?: {
    readonly doc_type?: string;
    readonly doc_number?: string;
  };
  readonly alternative_phone?: {
    readonly area_code: string;
    readonly number: string;
    readonly extension?: string;
  };
}

/** Single line item inside an order. */
export interface MLOrderItem {
  readonly item: {
    readonly id: string;
    readonly title: string;
    readonly category_id: string;
    readonly variation_id?: number;
    readonly seller_custom_field?: string;
    readonly condition?: string;
    readonly thumbnail?: string;
    readonly pictures?: MLPicture[];
    readonly seller_sku?: string;
    readonly warranty?: string;
    readonly condition_detail?: string | null;
  };
  readonly quantity: number;
  readonly unit_price: number;
  readonly full_unit_price?: number;
  readonly currency_id: string;
  readonly manufacturing_days?: number | null;
  readonly sale_fee?: number;
  readonly listing_type_id?: string;
  /** @deprecated Use `sale_fee` instead. */
  readonly sale_fee_amount?: number;
  readonly base_exchange_rate?: number | null;
  readonly element_id?: string;
  readonly fulfillment_status?: string;
  readonly logistic_type?: string;
  readonly catalog_product_id?: string;
}

/** Buyer/seller feedback attached to an order. */
export interface MLFeedback {
  readonly fulfilled: boolean;
  readonly rating: 'positive' | 'neutral' | 'negative';
  readonly message?: string;
  readonly date_created?: string;
}

/** Mediation opened on an order. */
export interface MLMediation {
  readonly id: number;
  readonly status: string;
  readonly type: string;
  readonly reason: string;
  readonly opening_date: string;
  readonly closing_date?: string;
  readonly resolution?: string;
}

/** Claim opened on an order. */
export interface MLClaim {
  readonly id: number;
  readonly type: string;
  readonly reason: string;
  readonly status: string;
  readonly date_created: string;
  readonly date_closed?: string;
  readonly order_id: number;
  readonly resource_id?: number;
  readonly resource_type?: string;
}

/** Return attached to an order. */
export interface MLReturn {
  readonly id: number;
  readonly order_id: number;
  readonly status: string;
  readonly date_created: string;
  readonly date_closed?: string;
  readonly shipping_tracking_number?: string;
  readonly shipping_carrier?: string;
  readonly refunded_amount?: number;
  readonly type?: string;
  readonly reason?: string;
}

// ============================================================================
// Payments
// ============================================================================

/** Payment attached to an order. */
export interface MLPayment {
  readonly id: number;
  readonly order_id?: number;
  readonly payer_id: number;
  readonly collector_id: number;
  readonly status: string;
  readonly status_detail?: string;
  readonly transaction_amount: number;
  readonly transaction_amount_refunded?: number;
  readonly currency_id: string;
  readonly date_created: string;
  readonly date_approved?: string;
  readonly date_last_modified?: string;
  readonly money_release_date?: string;
  readonly operation_type?: string;
  readonly payment_method_id: string;
  readonly payment_type_id?: string;
  readonly issuer_id?: string;
  readonly installments?: number;
  readonly card?: {
    readonly card_number?: string;
    readonly cardholder?: {
      readonly name: string;
      readonly identification?: {
        readonly number: string;
        readonly type: string;
      };
    };
  };
  readonly reason?: string;
  readonly total_paid_amount?: number;
  readonly shipping_cost?: number;
  readonly taxes_amount?: number;
  readonly coupon_amount?: number;
  readonly financing_fee?: number;
  readonly external_reference?: string;
  readonly statement_descriptor?: string;
  readonly marketplace_owner?: number;
  readonly metadata?: Record<string, string>;
}

// ============================================================================
// Shipping
// ============================================================================

/** Shipment attached to an order. */
export interface MLShipment {
  readonly id: number;
  readonly status: string;
  readonly status_history?: Array<{
    readonly date_shipped?: string;
    readonly date_delivered?: string;
    readonly status: string;
    readonly substatus?: string;
    readonly service_id?: string;
    readonly tracking_number?: string;
  }>;
  readonly status_detail?: string;
  readonly date_created?: string;
  readonly date_first_printed?: string | null;
  readonly date_handling?: string | null;
  readonly date_ready_to_ship?: string | null;
  readonly date_shipped?: string | null;
  readonly date_delivered?: string | null;
  readonly date_not_delivered?: string | null;
  readonly date_cancelled?: string | null;
  readonly tracking_number?: string;
  readonly tracking_method?: string;
  readonly service_id?: string;
  readonly carrier_id?: number | string;
  readonly carrier_info?: {
    readonly name?: string;
    readonly logo_url?: string;
    readonly tracking_url?: string;
    readonly phone?: string;
  };
  readonly sender_id?: number;
  readonly sender_address?: MLAddress;
  readonly receiver_id?: number;
  readonly receiver_address: MLAddress;
  readonly shipping_option?: {
    readonly id: number;
    readonly name: string;
    readonly currency_id: string;
    readonly cost: number;
    readonly list_cost?: number;
    readonly delivery_type?: string;
    readonly estimated_delivery_time?: {
      readonly type: string;
      readonly date?: string;
      readonly time_frame?: { from: string; to: string };
      readonly pay_before?: string;
    };
    readonly estimated_delivery_final?: {
      readonly date?: string;
      readonly time_from?: string;
      readonly time_to?: string;
    };
    readonly speed?: {
      readonly handling?: number;
      readonly transit?: number;
    };
    readonly service_description?: string;
  };
  readonly shipping_items?: Array<{
    readonly id: string;
    readonly description: string;
    readonly quantity: number;
    readonly dimensions?: string;
    readonly variation_id?: number;
    readonly dimensions_source?: string;
  }>;
  readonly cost: number;
  readonly currency_id: string;
  readonly base_cost?: number;
  readonly order_cost?: number;
  readonly order_id: number;
  readonly pack_id?: number;
  readonly logistic_type: string;
  readonly mode: string;
  readonly substatus?: string;
  readonly application_id?: string;
  readonly return_tracking_number?: string;
  readonly return_carrier_id?: number | string;
  readonly comments?: string;
  readonly priority_classification?: {
    readonly type: string;
    readonly handling_time?: number;
    readonly cost?: number;
  };
  readonly tags?: string[];
  readonly type?: string;
  readonly cross_docking?: boolean;
  readonly fulfillment?: {
    readonly type?: string;
    readonly warehouse_id?: string;
    readonly expected_delivery_date?: string;
    readonly planned_shipping_date?: string;
  };
}

/** Shipping summary attached to an order (lighter than full shipment). */
export interface MLOrderShipping {
  readonly id: number;
  readonly shipment_id?: number;
  readonly status?: string;
  readonly substatus?: string;
  readonly tracking_number?: string;
  readonly tracking_method?: string;
  readonly service_id?: string;
  readonly carrier_id?: number | string;
  readonly sender_id?: number;
  readonly receiver_id?: number;
  readonly freight_cost?: number;
  readonly cost?: number;
  readonly currency_id?: string;
  readonly mode?: string;
  readonly logistic_type?: string;
  readonly promise?: {
    readonly type?: string;
    readonly target?: {
      readonly type: string;
      readonly value?: string;
    };
  };
  readonly receiver_address?: MLAddress;
  readonly sender_address?: MLAddress;
}

/** Shipping label generation request. */
export interface MLShipmentLabel {
  readonly status: string;
  readonly substatus?: string;
  readonly tracking_number?: string;
  readonly service_id?: string;
  readonly date_created?: string;
  readonly date_last_updated?: string;
  readonly carrier_id?: number | string;
  readonly tracking_url?: string;
  readonly label_url?: string;
  readonly barcode?: string;
  readonly carrier_tracking_url?: string;
}

// ============================================================================
// Categories
// ============================================================================

/** Category tree node returned by `/categories/{id}`. */
export interface MLCategory {
  readonly id: string;
  readonly name: string;
  readonly picture?: string;
  readonly secure_picture?: string;
  readonly parent_id?: string | null;
  readonly settings?: {
    readonly adult_content?: boolean;
    readonly buying_allowed?: boolean;
    readonly buying_modes?: string[];
    readonly catalog_domain?: string;
    readonly coverage_areas?: string;
    readonly currencies?: string[];
    readonly fragile?: boolean;
    readonly immediate_payment?: boolean;
    readonly item_conditions?: string[];
    readonly items_reviews_allowed?: boolean;
    readonly listing_allowed?: boolean;
    readonly listing_exposures?: string[];
    readonly listing_types?: string[];
    readonly max_description_length?: number;
    readonly max_pictures_per_item?: number;
    readonly max_pictures_per_item_var?: number;
    readonly max_sub_title_length?: number;
    readonly max_title_length?: number;
    readonly maximum_price?: number;
    readonly minimum_price?: number;
    readonly mirror_category?: string | null;
    readonly mirror_master_category?: string | null;
    readonly no_indexed_attributes?: string[];
    readonly patterns?: string[];
    readonly payments?: string[];
    readonly pictures?: {
      readonly size_constraints?: string;
      readonly max_allowed?: number[];
    };
    readonly reservation_allowed?: 'optional' | 'required' | 'not_allowed';
    readonly restrictions?: Array<{
      readonly type: string;
      readonly reasons?: string[];
    }>;
    readonly rounded_address?: boolean;
    readonly seller_contact?: string;
    readonly shipping_modes?: string[];
    readonly shipping_options?: string[];
    readonly shipping_profile?: string;
    readonly show_contact_information?: boolean;
    readonly simple_shipping?: string;
    readonly stock?: string;
    readonly sub_vertical?: string;
    readonly subscribable?: boolean;
    readonly tags?: Array<{
      readonly hidden?: boolean;
      readonly multivalued?: boolean;
      readonly name: string;
      readonly required?: boolean;
      readonly type: string;
      readonly values?: Array<{ id: string; name: string; results?: number }>;
    }>;
    readonly vertical?: string;
    readonly vip?: 'not_eligible' | 'possible' | 'mandatory';
  };
  readonly attribute_groups?: Array<{
    readonly id: string;
    readonly name: string;
    readonly attributes: MLAttribute[];
  }>;
  readonly channels_settings?: Array<{
    readonly channel: string;
    readonly settings: Record<string, unknown>;
  }>;
  readonly meta_categories?: string[];
  readonly children_categories?: Array<{
    readonly id: string;
    readonly name: string;
    readonly total_items_in_this_category?: number;
  }>;
  readonly path_from_root?: Array<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly variations?: Array<{
    readonly id: string;
    readonly name: string;
    readonly variation_type?: string;
    readonly values?: Array<{
      readonly id: string;
      readonly name: string;
      readonly results?: number;
    }>;
    readonly attributes?: Array<{
      readonly id: string;
      readonly name: string;
      readonly value_type: string;
      readonly allowed_values?: Array<{ id: string; name: string }>;
      readonly default_value?: string;
    }>;
  }>;
}

/** Category prediction returned by `/categories/{id}/predict`. */
export interface MLCategoryPrediction {
  readonly id: string;
  readonly name: string;
  readonly probability: number;
  readonly payload?: Record<string, unknown>;
  readonly settings?: MLCategory['settings'];
}

// ============================================================================
// Questions / Messages
// ============================================================================

/** Question posted on a listing. */
export interface MLQuestion {
  readonly id: number;
  readonly status: string;
  readonly text: string;
  readonly answer?: {
    readonly text: string;
    readonly status: string;
    readonly date_created?: string;
  };
  readonly date_created: string;
  readonly item_id: string;
  readonly seller_id: number;
  readonly buyer_id: number;
  readonly from?: {
    readonly id: number;
    readonly answered_questions?: number;
  };
  readonly deleted?: boolean;
  readonly hold?: boolean;
  readonly tags?: string[];
}

// ============================================================================
// Advertising
// ============================================================================

/** Advertising advertiser summary. */
export interface MLAdvertiser {
  readonly advertiser_id: number;
  readonly nickname: string;
  readonly site_id: string;
  readonly list?: {
    readonly allow: boolean;
    readonly codes?: string[];
  };
  readonly status?: string;
}

/** Single advertising campaign. */
export interface MLAdCampaign {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly type: string;
  readonly start_date: string;
  readonly end_date?: string | null;
  readonly daily_budget: number;
  readonly total_budget?: number | null;
  readonly objectives?: {
    readonly acquisition?: {
      readonly channel: string;
      readonly metrics?: Array<{
        readonly metric: string;
        readonly unit: string;
      }>;
    };
  };
  readonly audience?: {
    readonly id?: number;
    readonly name?: string;
  };
  readonly cost?: {
    readonly total_amount: number;
    readonly currency_id: string;
  };
  readonly clicks?: number;
  readonly impressions?: number;
  readonly ctr?: number;
  readonly items?: Array<{
    readonly item_id: string;
    readonly campaigns?: MLAdCampaign[];
  }>;
  readonly channels?: string[];
  readonly version?: number;
  readonly date_created?: string;
  readonly last_updated?: string;
}

// ============================================================================
// Connection (DB record)
// ============================================================================

/**
 * Shape of the `connections` row in the database — the source of
 * truth for OAuth tokens per Mercado Livre account.
 *
 * `access_token` and `refresh_token` are expected to be encrypted
 * at rest (decrypted by the caller before being passed to
 * `MercadoLivreClient`). The client treats them as opaque strings.
 */
export interface Connection {
  /** UUID primary key in the local DB. */
  readonly id: string;
  /** ML user id (numeric). */
  readonly account_id: number;
  /** ML nickname. */
  readonly nickname: string;
  /** Site ID, e.g. `MLB` (Brazil). */
  readonly site_id: string;
  /** Encrypted ML access token (already decrypted by caller). */
  readonly access_token: string;
  /** Encrypted ML refresh token (already decrypted by caller). */
  readonly refresh_token: string;
  /** Access token expiration timestamp (ms since epoch). */
  readonly access_token_expires_at: number | null;
  /** ML app client_id (per connection so multi-app users work). */
  readonly client_id: string;
  /** ML app client_secret (encrypted; decrypted by caller). */
  readonly client_secret: string;
  /** OAuth scopes granted by this user. */
  readonly scopes: string[];
  /** Tenant ID for multi-tenant data isolation. */
  readonly tenant_id?: string;
  /** Whether the connection is currently active. */
  readonly is_active?: boolean;
  /** ISO timestamp of last successful sync. */
  readonly last_synced_at?: string | null;
  /** Connection metadata / free-form. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of an OAuth token exchange / refresh.
 */
export interface MLTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: 'Bearer' | 'bearer' | string;
  readonly scope: string;
  readonly user_id: number;
  readonly expires_in: number;
  readonly refresh_expires_in?: number;
  readonly issued_at?: string;
}

/**
 * Options accepted by {@link MercadoLivreClient}.
 */
export interface MercadoLivreClientOptions {
  readonly logger?: Logger;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly refreshLeadMs?: number;
  readonly rateLimiter?: import('./rate-limiter').RateLimiter;
  readonly fetcher?: Fetcher;
}

/**
 * Structured logger interface compatible with pino, bunyan, console,
 * etc. Methods receive a message plus an optional context object.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Minimal HTTP fetcher contract — compatible with `fetch`, `undici`,
 * or any mock implementation.
 *
 * Uses `BodyInit | null` so callers can pass any of the bodies `fetch`
 * itself accepts (string, `URLSearchParams`, `FormData`, `Blob`, etc.).
 */
export type Fetcher = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

// ============================================================================
// OAuth helpers
// ============================================================================

/** OAuth flow state, exchanged between `/authorize` and the callback. */
export interface MLOAuthState {
  readonly state: string;
  readonly returnTo?: string;
  readonly tenantId?: string;
  readonly createdAt: number;
}

/** Query params returned by ML on the OAuth callback. */
export interface MLOAuthCallback {
  readonly code: string;
  readonly state: string;
}

/** Scopes commonly requested by integration apps. */
export type MLScope =
  | 'read'
  | 'write'
  | 'offline_access'
  | 'orders'
  | 'items'
  | 'questions'
  | 'shipments'
  | 'advertising'
  | 'users'
  | 'billing'
  | 'categories'
  | 'reports'
  | 'loyalty'
  | 'mediations'
  | 'claims'
  | 'financial'
  | 'messages'
  | 'inventory'
  | 'brands'
  | 'domain';

/** Item search filters used by `/users/{id}/items/search` and `/items/search`. */
export interface MLItemSearchFilters {
  readonly status?: string;
  readonly site_id?: string;
  readonly title?: string;
  readonly seller_id?: number;
  readonly category_id?: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly sort?: MLSort;
  readonly [filter: string]: string | number | MLSort | undefined;
}

/** Order search filters used by `/orders/search`. */
export interface OrderSearchFilters {
  readonly seller?: number;
  readonly buyer?: number;
  readonly 'order.status'?: MLOrderStatus | MLOrderStatus[];
  readonly 'order.date_created.from'?: string | Date;
  readonly 'order.date_created.to'?: string | Date;
  readonly 'order.date_last_updated.from'?: string | Date;
  readonly 'order.date_last_updated.to'?: string | Date;
  readonly 'order.date_closed.from'?: string | Date;
  readonly 'order.date_closed.to'?: string | Date;
  readonly 'order.total.amount'?: number;
  readonly 'order.total.currency'?: string;
  readonly 'order.shipping.status'?: string;
  readonly 'order.shipping.id'?: number;
  readonly 'order.payment.status'?: string;
  readonly 'order.payment.method'?: string;
  readonly 'order.payment.type'?: string;
  readonly 'order.buyer.first_name'?: string;
  readonly 'order.buyer.last_name'?: string;
  readonly 'order.buyer.nickname'?: string;
  readonly 'order.pack_id'?: number;
  readonly 'order.flag'?: 'paid' | 'not_paid' | 'pending';
  readonly 'order.tags'?: string | string[];
  readonly sort?: MLSort;
  readonly offset?: number;
  readonly limit?: number;
  readonly [k: string]: string | number | string[] | Date | MLSort | undefined;
}

/** Question search filters used by `/questions/search`. */
export interface MLQuestionSearchFilters {
  readonly seller_id?: number;
  readonly item_id?: string;
  readonly status?: 'UNANSWERED' | 'ANSWERED' | 'CLOSED_UNANSWERED' | 'UNDER_REVIEW';
  readonly from?: string | Date;
  readonly to?: string | Date;
  readonly offset?: number;
  readonly limit?: number;
  readonly sort?: MLSort;
}

/** Advertising campaign search filters used by `/advertising/{advertiser_id}/campaigns/search`. */
export interface MLAdCampaignSearchFilters {
  readonly status?: 'active' | 'paused' | 'finished' | 'all';
  readonly type?: string;
  readonly date_from?: string | Date;
  readonly date_to?: string | Date;
  readonly offset?: number;
  readonly limit?: number;
}

/** Pagination options accepted by `withPagination`. */
export interface PaginationOptions {
  /** Max items to fetch across all pages. Default: no cap. */
  readonly maxItems?: number;
  /** Hard cap on pages fetched (safety). Default: 1000. */
  readonly maxPages?: number;
  /** Per-page size. Default: 50 (ML default). */
  readonly pageSize?: number;
}