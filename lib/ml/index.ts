/**
 * Public API surface of the Mercado Livre client library.
 *
 * Import from `@/lib/ml` to access the client, endpoints, types,
 * errors, and OAuth helpers in one place.
 *
 * @module @/lib/ml
 */

// Client + config
export {
  MercadoLivreClient,
  ML_API_BASE_URL,
} from './client';
export type {
  ClientConfig,
  OnTokenRefreshed,
} from './client';

// OAuth helpers
export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  refreshAndPersist,
  generateState,
  validateState,
  ML_OAUTH_BASE_URL,
  ML_OAUTH_TOKEN_URL,
  ML_API_BASE_URL as ML_API_BASE_URL_OAUTH,
  SCOPE_PRESETS,
} from './oauth';
export type { TokenPersistenceHooks } from './oauth';

// Errors
export {
  MercadoLivreError,
  MLAuthError,
  MLRateLimitError,
  MLNotFoundError,
  MLValidationError,
  MLNetworkError,
  isRateLimited,
  getRetryAfter,
  createApiError,
} from './errors';
export type { RateLimiterTimeoutError as RateLimiterTimeoutErrorType } from './rate-limiter';

// Rate limiter
export {
  RateLimiter,
  RateLimiterTimeoutError,
  RateLimiterDestroyedError,
  getGlobalRateLimiter,
  _resetGlobalRateLimiterForTests,
  DEFAULT_RATE_LIMITER_CONFIG,
} from './rate-limiter';
export type { RateLimiterConfig } from './rate-limiter';

// Types — main shapes
export type {
  // Common
  MLDate,
  MLMoney,
  MLAddress,
  MLPagination,
  MLSearchResponse,
  MLSort,
  MLSortDirection,
  // Users
  MLUser,
  MLSellerReputation,
  MLBuyerReputation,
  // Items
  MLItem,
  MLPicture,
  MLSaleTerm,
  MLPaymentMethod,
  MLShippingSummary,
  MLSellerAddress,
  MLSellerContact,
  MLELocation,
  MLAttribute,
  MLItemVariation,
  // Orders
  MLOrder,
  MLOrderStatus,
  MLOrderParty,
  MLOrderItem,
  MLOrderShipping,
  MLFeedback,
  MLMediation,
  MLClaim,
  MLReturn,
  // Payments
  MLPayment,
  // Shipments
  MLShipment,
  MLShipmentLabel,
  // Categories
  MLCategory,
  MLCategoryPrediction,
  // Questions
  MLQuestion,
  // Advertising
  MLAdvertiser,
  MLAdCampaign,
  // DB row + auth
  Connection,
  MLTokenResponse,
  MLScope,
  MLOAuthState,
  MLOAuthCallback,
  // Search filter shapes
  MLItemSearchFilters,
  OrderSearchFilters,
  MLQuestionSearchFilters,
  MLAdCampaignSearchFilters,
  // Client config
  Logger,
  Fetcher,
  MercadoLivreClientOptions,
  PaginationOptions,
} from './types';

// Endpoints
export { UsersEndpoint } from './endpoints/users';
export type { UserItemsFilters } from './endpoints/users';

export { ItemsEndpoint } from './endpoints/items';
export type {
  MLItemSummary,
  MLItemMultiGetRequest,
  UserItemsFilters as ItemsUserFilters,
} from './endpoints/items';

export { OrdersEndpoint } from './endpoints/orders';
export type { MLOrderSearchResponse } from './endpoints/orders';

export { ShipmentsEndpoint } from './endpoints/shipments';
export type {
  MLShipmentLabelOptions,
  MLShipmentTrackingUpdate,
  MLShipmentCostRequest,
} from './endpoints/shipments';

export { CategoriesEndpoint } from './endpoints/categories';
export type { MLCategorySummary } from './endpoints/categories';

export { QuestionsEndpoint } from './endpoints/questions';
export type { MLQuestionSearchResponse } from './endpoints/questions';

export { AdsEndpoint } from './endpoints/ads';
export type {
  MLAdCampaignSearchResponse,
  MLAdCampaignCreate,
} from './endpoints/ads';