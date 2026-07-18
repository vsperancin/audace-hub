# `@/lib/ml` — Mercado Livre Client

A typed, production-grade HTTP client for the Mercado Livre REST API.

## Highlights

- **Auto-refresh** — `access_token` is refreshed 5 minutes before expiry, lazily (only on the next request). Concurrent refreshes are coalesced via an in-memory mutex.
- **Exponential backoff with full jitter** — 3 retries on `429`, `5xx`, and network errors; respects `Retry-After` when present.
- **Per-connection token-bucket rate limiter** — 10 RPS sustained, 10-burst capacity (configurable via env).
- **Pagination helper** — `client.withPagination()` loops search endpoints automatically.
- **Typed errors** — `MLAuthError`, `MLRateLimitError`, `MLNotFoundError`, `MLValidationError`, plus `MercadoLivreError` base.
- **Dependency injection** — `Logger`, `Fetcher`, and `RateLimiter` are all injectable; no global state leaks.
- **Zero runtime deps** — uses Node's built-in `fetch` and `crypto`. `zod` is optional (used by caller-side validation, not required by the client).

## File layout

```
lib/ml/
├── client.ts              # MercadoLivreClient class
├── oauth.ts               # OAuth flow helpers
├── types.ts               # Full ML API type mirror
├── errors.ts              # Typed error classes + helpers
├── rate-limiter.ts        # Token-bucket rate limiter
├── index.ts               # Barrel export — import from here
├── endpoints/
│   ├── users.ts
│   ├── items.ts
│   ├── orders.ts
│   ├── shipments.ts
│   ├── categories.ts
│   ├── questions.ts
│   └── ads.ts
└── README.md
```

## Installation

No dependencies need to be installed — this library uses Node's built-in `fetch` (Node 20+) and `crypto.randomBytes`. Just import:

```ts
import { MercadoLivreClient, OrdersEndpoint } from '@/lib/ml';
```

## Configuration

All client behavior can be tuned via environment variables or per-instance options.

| Env var                           | Default | Purpose                            |
| --------------------------------- | ------- | ---------------------------------- |
| `ML_TIMEOUT_MS`                   | `30000` | Per-request timeout                |
| `ML_MAX_RETRIES`                  | `3`     | Retry count on transient failures  |
| `ML_BASE_BACKOFF_MS`              | `500`   | Base for exponential backoff       |
| `ML_MAX_BACKOFF_MS`               | `30000` | Backoff cap                        |
| `ML_REFRESH_LEAD_MS`              | `300000`| Refresh token 5 min before expiry  |
| `ML_RATE_LIMIT_CAPACITY`          | `10`    | Token bucket capacity              |
| `ML_RATE_LIMIT_REFILL_PER_SECOND` | `10`    | Token refill rate                  |
| `ML_RATE_LIMIT_ACQUIRE_TIMEOUT_MS`| `60000` | Max wait when bucket is empty      |

Override per-instance via the constructor options:

```ts
new MercadoLivreClient(connection, {
  timeoutMs: 60_000,
  maxRetries: 5,
  logger: pinoLogger,
});
```

## Quick start

### 1. Build the OAuth authorization URL

```ts
import { buildAuthorizationUrl, generateState, SCOPE_PRESETS } from '@/lib/ml';

const state = generateState();
// Persist `state` in the user's session (cookie or DB) for CSRF validation.

const authUrl = buildAuthorizationUrl(
  process.env.ML_CLIENT_ID!,
  `${process.env.APP_URL}/api/ml/callback`,
  SCOPE_PRESETS.SELLER_DASHBOARD,
  state,
);

// Redirect the user to `authUrl`.
```

### 2. Handle the OAuth callback

```ts
import { exchangeCodeForTokens, validateState } from '@/lib/ml';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code')!;
  const state = url.searchParams.get('state')!;
  const sessionState = req.cookies.get('ml_oauth_state')!;

  if (!validateState(state, sessionState)) {
    return new Response('Invalid state', { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(
    code,
    process.env.ML_CLIENT_ID!,
    process.env.ML_CLIENT_SECRET!,
    `${process.env.APP_URL}/api/ml/callback`,
  );

  // Persist `tokens.access_token`, `tokens.refresh_token`,
  // `tokens.expires_in`, and `tokens.user_id` to the database,
  // encrypted at rest.
  await db.connections.insert({
    account_id: tokens.user_id,
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    access_token_expires_at: Date.now() + tokens.expires_in * 1000,
    client_id: process.env.ML_CLIENT_ID!,
    client_secret: encrypt(process.env.ML_CLIENT_SECRET!),
    scopes: tokens.scope.split(' '),
  });

  return Response.redirect('/dashboard');
}
```

### 3. Use the client to make API calls

```ts
import { MercadoLivreClient, OrdersEndpoint } from '@/lib/ml';
import { decrypt } from '@/lib/crypto/tokens';

const conn = await db.connections.findOne({ id: connectionId });
const decrypted: Connection = {
  ...conn,
  access_token: decrypt(conn.access_token),
  refresh_token: decrypt(conn.refresh_token),
  client_secret: decrypt(conn.client_secret),
};

const client = new MercadoLivreClient(decrypted, {
  logger: console,
  onTokenRefreshed: async (c, tokens) => {
    // Persist new tokens (ML rotates the refresh token on every refresh).
    await db.connections.update(c.id, {
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      access_token_expires_at: Date.now() + tokens.expires_in * 1000,
    });
  },
});

const orders = new OrdersEndpoint(client);
const recent = await orders.search(conn.account_id, {
  status: 'paid',
  'order.date_last_updated.from': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
});
```

## Endpoint examples

### Users

```ts
const users = new UsersEndpoint(client);
const me = await users.me();
const profile = await users.get(12345);
const itemIds = await users.listItemIds(12345, { status: 'active', limit: 50 });
```

### Items

```ts
const items = new ItemsEndpoint(client);
const item = await items.get('MLB1234567890');
const batch = await items.getMany(['MLB1234567890', 'MLB0987654321']);
const variations = await items.getVariations('MLB1234567890');

// Search globally
const search = await items.search('MLB', { status: 'active', category_id: 'MLB1051' });

// List ALL items for a seller (auto-paginated)
const allMyItems = await items.listAllBySeller(12345, { status: 'active' }, { maxItems: 500 });

// Lifecycle operations
await items.pause('MLB1234567890');
await items.resume('MLB1234567890');
await items.update('MLB1234567890', { price: 99.9 });
await items.close('MLB1234567890');
```

### Orders

```ts
const orders = new OrdersEndpoint(client);

// Single order
const order = await orders.get(2000000123456789);

// Recent paid orders, auto-paginated
const recent = await orders.recentByStatus(
  conn.account_id,
  'paid',
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  { maxItems: 200 },
);

// Advanced search
const filtered = await orders.search(conn.account_id, {
  'order.status': ['paid', 'shipped'],
  'order.date_created.from': new Date('2024-01-01'),
  sort: { field: 'date_created', direction: 'desc' },
});

// State transitions
await orders.markAsHandled(2000000123456789);
await orders.updateShipping(2000000123456789, { tracking_number: 'BR123' });
```

### Shipments

```ts
const shipments = new ShipmentsEndpoint(client);
const shipment = await shipments.get(4321);
const label = await shipments.generateLabel(4321, { format: 'pdf' });
console.log(label[0].label_url);
```

### Categories

```ts
const cats = new CategoriesEndpoint(client);
const mlb = await cats.get('MLB1051');
const predicted = await cats.predictByTitle('MLB', 'iPhone 13 Pro Max 256gb');
```

### Questions

```ts
const questions = new QuestionsEndpoint(client);
const unanswered = await questions.unansweredForSeller(conn.account_id, { maxItems: 50 });

await questions.answer(unanswered[0].id, 'Obrigado pela pergunta! Resposta aqui.');
```

### Advertising

```ts
const ads = new AdsEndpoint(client);
const campaigns = await ads.listAllCampaigns(conn.account_id, { status: 'active' });

await ads.pauseCampaign(conn.account_id, campaigns[0].id);
await ads.addItemsToCampaign(conn.account_id, campaigns[0].id, ['MLB1234567890']);
```

## Generic pagination

The `withPagination<TPage, TItem>` helper auto-loops any search endpoint until results are exhausted (or `maxItems` / `maxPages` is reached):

```ts
const allOrders: MLOrder[] = await client.withPagination(
  async ({ offset, limit }) => {
    return client.get<MLSearchResponse<MLOrder>>('/orders/search', {
      seller: 12345,
      offset,
      limit,
    });
  },
  { maxItems: 1000, pageSize: 50 },
);
```

Each endpoint also exposes its own `*All` / `listAll*` helper that wraps this internally:

```ts
const allItems = await items.listAllBySeller(12345);
const allOrders = await orders.searchAll(12345, { 'order.status': 'paid' });
const allCampaigns = await ads.listAllCampaigns(12345);
```

## Error handling

```ts
import { isRateLimited, getRetryAfter, MLNotFoundError, MLAuthError } from '@/lib/ml';

try {
  await orders.get(999999);
} catch (err) {
  if (err instanceof MLNotFoundError) {
    return notFound();
  }
  if (err instanceof MLAuthError) {
    // Refresh token is dead — kick the user back to /authorize.
    return redirectToReauth();
  }
  if (isRateLimited(err)) {
    const seconds = getRetryAfter(err);
    return retryLater(seconds ?? 60);
  }
  throw err;
}
```

The client **automatically retries** the following errors before bubbling up:

- `429 Too Many Requests` (using `Retry-After`)
- `5xx` server errors
- Network errors (DNS, TCP, timeout)

After `maxRetries` (default 3) the original error is thrown so the caller can handle it.

## Testing

The client accepts injected `Fetcher`, `Logger`, and `RateLimiter`, making it trivial to test:

```ts
import { MercadoLivreClient, RateLimiter } from '@/lib/ml';

const mockFetcher: Fetcher = async (url, init) => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  text: async () => JSON.stringify({ id: 123, title: 'Test Item' }),
  json: async () => ({ id: 'MLB1', title: 'Test Item' }),
});

const conn: Connection = {
  id: 'conn-1',
  account_id: 12345,
  nickname: 'test',
  site_id: 'MLB',
  access_token: 'fake-access',
  refresh_token: 'fake-refresh',
  access_token_expires_at: Date.now() + 60_000,
  client_id: 'app-id',
  client_secret: 'app-secret',
  scopes: ['read', 'write', 'offline_access'],
};

const client = new MercadoLivreClient(conn, {
  fetcher: mockFetcher,
  rateLimiter: new RateLimiter({ capacity: 100, refillPerSecond: 100 }),
});

const item = await client.get<{ id: string; title: string }>('/items/MLB1');
expect(item.id).toBe('MLB1');
```

## Notes & limitations

- **In-memory rate limiter** is per-Node-process. For multi-replica deployments, swap `getGlobalRateLimiter()` for a Redis-backed implementation — the `RateLimiter` interface is small and stable.
- **Refresh mutex** is in-memory too. Concurrent refresh attempts on the same replica coalesce; cross-replica, you may see a duplicate refresh call during a brief window. This is harmless — the persisted tokens win, and the next request uses them.
- **No request body transforms**: the client passes JSON through unchanged. Use ML's snake_case field names exactly as documented at https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br
- **No automatic pagination in the underlying `request()`** — you opt in by calling `withPagination` or one of the `*All` helpers. This keeps memory usage predictable for callers who only want the first page.