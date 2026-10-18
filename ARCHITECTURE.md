# ARCHITECTURE.md — Tokenwise

How the system is built and why. Requirements live in SPEC.md; conventions for contributors and agents live in AGENTS.md.

## 1. Stack

| Layer | Choice |
|---|---|
| Web | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui |
| API | Node + TypeScript, Fastify |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Better Auth (mounted in the API, Postgres-backed sessions) |
| LLM | Anthropic Claude via the Vercel AI SDK |
| Rate limits, counters, jobs | Redis + BullMQ |
| Billing | Stripe subscriptions + webhooks |
| Tests | Vitest |
| Repo | pnpm + Turborepo monorepo |
| Hosting | Vercel (web); Railway or Fly.io (API, Postgres, Redis) |
| CI | GitHub Actions |

## 2. Repository layout

```
.
├── apps/
│   ├── web/                 # Next.js app (UI only, no business logic)
│   └── api/                 # Fastify service (all business logic)
│       ├── src/
│       │   ├── routes/      # HTTP handlers, thin
│       │   ├── services/    # chat, quota, billing, usage
│       │   ├── db/          # Drizzle client, queries
│       │   ├── jobs/        # BullMQ workers
│       │   ├── lib/         # redis, stripe, ai, logger
│       │   └── server.ts
│       └── test/
├── packages/
│   ├── shared/              # zod schemas, plan config, error codes, types
│   └── db/                  # Drizzle schema + migrations
├── turbo.json
├── pnpm-workspace.yaml
└── docs: SPEC.md ARCHITECTURE.md AGENTS.md CLAUDE.md
```

Rule: `apps/web` never talks to Postgres, Redis, Stripe secret APIs, or Anthropic directly. It talks only to `apps/api`.

## 3. System overview

```
                 ┌────────────────────┐
  Browser ─────▶ │  Next.js (Vercel)  │  UI, useChat, auth client
     │           └────────────────────┘
     │  HTTPS + cookies (api.<domain>), SSE for chat
     ▼
┌───────────────────────────────────────────────┐
│ Fastify API (Railway/Fly)                     │
│  routes ─▶ services ─▶ db / redis / ai / stripe│
│  Better Auth, rate limit, quota, metering     │
└───────┬───────────┬───────────┬───────────────┘
        │           │           │
        ▼           ▼           ▼
   PostgreSQL     Redis      Anthropic API
   (source of   (counters,   (streaming)
    truth)       limits,
                 BullMQ)          ▲
        ▲                         │
        │        BullMQ workers ──┘ (titles, rollups)
        │
   Stripe ──webhooks──▶ API /webhooks/stripe
```

## 4. Key decisions

| # | Decision | Why | Tradeoff |
|---|---|---|---|
| D1 | Separate API service instead of Next.js route handlers | Long-lived SSE streams, workers, and webhooks fit a real server better than serverless limits; clearer boundaries | Two deployables, CORS and cookie setup |
| D2 | Postgres is the source of truth for usage; Redis is a fast gate | Redis can be lost; the ledger cannot | Two places to keep consistent, reconciled by a job |
| D3 | Reserve-then-settle quota accounting | Prevents concurrent requests from overshooting quota | More moving parts than check-then-run |
| D4 | Webhook-driven plan state | The browser redirect is not trustworthy | Short delay between payment and plan change |
| D5 | Auth in the API, not Next.js | One place validates sessions for all consumers | Cross-origin cookies need care |
| D6 | SSE, not WebSockets | One-way token stream, simple, proxy friendly, matches AI SDK | No client-to-server channel on the same connection |
| D7 | Append-only ledger | Auditable, easy to rebuild aggregates | Needs rollups for fast reads |

## 5. Authentication

- Better Auth runs inside `apps/api`, mounted under `/auth/*`, storing users, sessions, and accounts in Postgres.
- The web app uses the Better Auth client pointed at `https://api.<domain>`.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=.<domain>` so web and API subdomains share it.
- CORS allows only the web origin, with credentials.
- A Fastify `requireUser` preHandler resolves the session and attaches `request.user`. Every route that touches user data uses it.
- All queries are scoped by `user_id`; there is no route that accepts a user id from the client.

## 6. Chat streaming flow

1. Web `useChat` posts `{conversationId, messages}` to `POST /chat`.
2. API: `requireUser` → validate body (zod, length caps) → load plan.
3. **Rate limit** check (Redis sliding window per user).
4. **Reserve quota** (section 7). If it fails, respond with a typed error before calling the model.
5. Persist the user message; create an `assistant` message row with `status = 'streaming'`.
6. Call `streamText` with the model, history window, and the plan's `maxOutputTokens`. Pass an `AbortSignal` tied to the client connection.
7. Pipe the AI SDK stream to the HTTP response as SSE.
8. On finish (success, abort, or error): write final message content and status, read provider usage, **settle** the reservation, append the ledger row, enqueue a title job if it is the first exchange.

Abort handling: when the client disconnects or the user presses stop, the abort signal cancels the provider request. Settlement uses tokens actually produced; if usage is unavailable, fall back to an estimate and set `usage_estimated = true`.

## 7. Quota and metering design

### 7.1 Data
- `quota_periods(user_id, period_start, period_end, token_limit, tokens_used, tokens_reserved)` in Postgres.
- Redis mirrors the current period for fast checks: `quota:{userId}:{periodStart}` hash with `used` and `reserved`.

### 7.2 Reserve
A Lua script in Redis runs atomically:
```
if used + reserved + estimate > limit then reject
else reserved += estimate; return reservationId
```
Estimate = input token estimate + plan `maxOutputTokens`. Reservations get a TTL so crashed requests cannot hold quota forever.

### 7.3 Settle
After the stream ends: `reserved -= estimate; used += actual`. Then, in one Postgres transaction, insert the `usage_ledger` row and increment `quota_periods.tokens_used`.

### 7.4 Recovery and reconciliation
- A BullMQ repeatable job compares Redis counters with Postgres sums and repairs Redis from Postgres on drift.
- If Redis is unavailable, the API fails closed for chat (503 with a clear message) rather than allowing unmetered usage.
- Postgres is authoritative; Redis can always be rebuilt from `usage_ledger`.

### 7.5 Rate limiting
Per-user sliding window in Redis keyed by plan RPM. Responses include `Retry-After`. Separate coarse per-IP limit on auth routes.

## 8. Billing design

- Checkout: `POST /billing/checkout` creates a Stripe Checkout Session for the user (customer created on first use) and returns the URL.
- Portal: `POST /billing/portal` returns a Customer Portal URL.
- Webhook: `POST /webhooks/stripe` verifies the signature against the raw body, then handles:
  - `checkout.session.completed`
  - `customer.subscription.created | updated | deleted`
  - `invoice.payment_failed`
- Idempotency: each event id is inserted into `stripe_events` with a unique constraint; duplicates are acknowledged and skipped. Handlers tolerate out-of-order delivery by trusting the subscription object's current state.
- Plan resolution: `subscriptions.status` and `current_period_end` determine the effective plan. Entitlements are computed in one function (`getEffectivePlan(user)`) used everywhere.

## 9. Data model

```
users(id, email, name, created_at, ...)            -- managed with Better Auth
sessions(id, user_id, expires_at, ...)
accounts(id, user_id, provider, provider_account_id, ...)

subscriptions(id, user_id, stripe_customer_id, stripe_subscription_id,
              plan, status, current_period_start, current_period_end,
              cancel_at_period_end, updated_at)

conversations(id, user_id, title, created_at, updated_at, deleted_at)
messages(id, conversation_id, role, content, status,       -- streaming|complete|stopped|error
         model, created_at)

usage_ledger(id, user_id, conversation_id, message_id, model,
             input_tokens, output_tokens, cost_micros,
             usage_estimated, status, created_at)           -- append-only

quota_periods(id, user_id, period_start, period_end,
              token_limit, tokens_used)

stripe_events(id, type, received_at, processed_at)          -- id = Stripe event id
```

Indexes: `messages(conversation_id, created_at)`, `usage_ledger(user_id, created_at)`, `conversations(user_id, updated_at)`, unique `quota_periods(user_id, period_start)`.

Cost is stored as integer micro-dollars to avoid float errors.

## 10. Background jobs (BullMQ)

| Queue | Job | Trigger |
|---|---|---|
| `titles` | Generate a conversation title with a cheaper model | After first exchange |
| `usage` | Reconcile Redis counters with Postgres | Repeatable, every few minutes |
| `retention` | Delete Free-plan conversations older than 30 days | Repeatable, daily |

Workers run in the API process for v1 and can move to a separate process later without code changes.

## 11. Frontend

- App Router pages: `/` (landing), `/chat/[id]`, `/usage`, `/settings`, `/login`.
- Server components for static shells; client components for chat, using the AI SDK React hooks against the API endpoint.
- API access goes through a typed client in `packages/shared` so request and response shapes are shared with the API (zod schemas).
- Quota meter and error states (`QUOTA_EXCEEDED`, `RATE_LIMITED`, `PROVIDER_ERROR`) are first-class UI states, not generic toasts.

## 12. Error model

All API errors share one shape from `packages/shared`:

```
{ error: { code, message, retryAfterSeconds?, details? } }
```

Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `PROVIDER_ERROR`, `INTERNAL`.

## 13. Observability

- Structured JSON logs with pino; a request id on every log line and returned in a response header.
- Every chat request logs: user id, model, input/output tokens, latency to first token, total duration, outcome.
- `/health` (liveness) and `/ready` (Postgres and Redis reachable).
- Alert-worthy signals: provider error rate, reconciliation drift, webhook failures, daily spend above threshold.

## 14. Security

- All secrets via environment variables; none in the repo. `.env.example` documents them.
- Webhook signature verification on raw body.
- Zod validation on every input; maximum message length and message count per request.
- Ownership checks in every query; tests assert cross-user access fails.
- Rate limits on chat and auth routes.
- Output rendered as Markdown with sanitization; no raw HTML from the model.
- Dependency updates and `pnpm audit` in CI.

## 15. Deployment

- **Web**: Vercel, env var `NEXT_PUBLIC_API_URL`.
- **API**: Railway or Fly.io, Docker image, health checks, graceful shutdown that lets in-flight streams finish or abort cleanly.
- **Postgres and Redis**: managed instances next to the API (same region as the API to keep latency low).
- Migrations run as a release step (`drizzle-kit migrate`) before the new API version receives traffic.
- Environments: `local` (Docker Compose for Postgres and Redis), `preview` (optional), `production`. Stripe runs in test mode everywhere except real production.

## 16. Local development

```
docker compose up -d        # postgres + redis
pnpm install
pnpm db:migrate
pnpm dev                    # turbo runs web and api
stripe listen --forward-to localhost:4000/webhooks/stripe
```

## 17. Testing strategy

- **Unit**: plan resolution, token estimation, quota math, error mapping.
- **Integration** (Vitest + real Postgres and Redis via containers): reserve/settle under concurrency, webhook idempotency, ownership checks, rate limiting.
- **Streaming**: the model is replaced with a deterministic mock stream so tests spend no tokens; cover normal finish, mid-stream abort, provider error, and missing usage data.
- **Smoke**: a script that signs in and sends one real message against a staging key, run manually before releases.

## 18. Known risks

| Risk | Mitigation |
|---|---|
| Redis and Postgres drift | Authoritative ledger plus reconciliation job |
| Leaked reservations after crashes | Reservation TTL and settle-on-shutdown hook |
| Runaway cost | Hard per-request caps, plan limits, daily spend alarm |
| Cross-origin cookie problems | Shared parent domain, tested in staging early (milestone 1) |
| AI SDK API changes between versions | Pin versions, wrap the SDK behind `lib/ai.ts` |

## 19. Future extensions

Organization workspaces with shared quotas, multi-provider routing with per-model pricing, RAG over uploaded files, usage-based Stripe metering, prompt versioning and evals.
