# SPEC.md — Tokenwise

> Working name: **Tokenwise** (rename freely). A multi-tenant streaming AI chat product with conversation history, token metering, and plan-based quotas.

## 1. Purpose

Build a production-style AI chat app that demonstrates the parts real AI products have to get right: streaming responses, per-user cost control, usage-based limits, subscription billing, and reliability under failure. It is a portfolio project, so every feature should be demonstrable, tested, and explainable in an interview.

## 2. Goals

- Stream Claude responses token-by-token with low time-to-first-token.
- Persist conversations and messages per user.
- Meter every request (input tokens, output tokens, estimated cost) in an append-only ledger.
- Enforce plan quotas (monthly tokens) and burst limits (requests per minute) before and during generation.
- Sell and manage plans through Stripe subscriptions, with webhooks as the source of truth for plan state.
- Show users their own usage clearly.
- Be deployed with a public URL, CI, and a documented architecture.

## 3. Non-goals (v1)

- Team or organization workspaces (single-user accounts only).
- File uploads, RAG, or tool use.
- Multi-provider routing (Claude only; the AI SDK keeps the door open).
- Mobile apps.
- Self-serve admin dashboard beyond a minimal usage view.

## 4. Users

| Persona | Needs |
|---|---|
| Free user | Try the product, see clearly what the limit is |
| Pro user | Higher limits, uninterrupted chats, manage subscription |
| Operator (you) | See cost, usage, and errors; trust the quota logic |

## 5. Plans and limits

Values are configurable constants in `packages/shared`, not hardcoded in logic.

| | Free | Pro |
|---|---|---|
| Monthly token quota (input + output) | 50,000 | 2,000,000 |
| Requests per minute | 10 | 60 |
| Max output tokens per response | 1,024 | 4,096 |
| Conversation history retained | 30 days | Unlimited |
| Price | $0 | Placeholder (Stripe Price ID in env) |

Quota period is the calendar month in UTC for Free, and the Stripe billing period for Pro.

## 6. Functional requirements

### 6.1 Authentication
- FR-A1: Sign up and sign in with email + password and at least one OAuth provider (GitHub).
- FR-A2: Sessions are cookie-based and verified by the API on every request.
- FR-A3: Users can sign out and delete their account (deletes conversations; keeps anonymized ledger rows).

### 6.2 Chat
- FR-C1: A signed-in user can create, rename, list, and delete conversations.
- FR-C2: Sending a message streams the assistant reply to the UI over SSE.
- FR-C3: The user can stop generation mid-stream; partial output is saved and metered for tokens actually produced.
- FR-C4: Messages persist after completion, including on stop or error (with a status flag).
- FR-C5: Conversation titles are auto-generated from the first exchange (background job, cheap model call).
- FR-C6: Markdown and code blocks render correctly in the UI.

### 6.3 Metering and quotas
- FR-M1: Every model call writes a `usage_ledger` row (user, conversation, model, input tokens, output tokens, cost estimate, status).
- FR-M2: Before a call starts, the API checks the remaining monthly quota and rate limit; over-limit requests return a typed error (`QUOTA_EXCEEDED` or `RATE_LIMITED`) with reset time.
- FR-M3: Quota is reserved up front (estimated worst case) and settled with actual usage when the stream ends.
- FR-M4: A user cannot exceed their quota by running concurrent requests.
- FR-M5: The UI shows remaining quota and warns at 80% and 100%.

### 6.4 Billing
- FR-B1: Free users can upgrade to Pro through Stripe Checkout.
- FR-B2: Pro users manage or cancel through the Stripe Customer Portal.
- FR-B3: Plan state in the database changes only from verified Stripe webhooks (never from the client redirect).
- FR-B4: Webhook handling is idempotent and safe to replay.
- FR-B5: On downgrade or cancellation, the plan switches at period end.

### 6.5 Usage page
- FR-U1: Users see tokens used this period, daily usage chart, and per-conversation usage.

## 7. Non-functional requirements

| Area | Target |
|---|---|
| Time to first token | p50 under 1.5 s (excluding model latency variance) |
| Availability of non-AI routes | Unaffected by provider outages |
| Provider failure | Graceful error message, no ledger corruption, no stuck reservations |
| Security | OWASP basics, rate limiting, input size limits, secrets only in env |
| Privacy | Users can only read their own data; enforced in queries, tested |
| Cost safety | Hard per-request output cap; global daily spend alarm |
| Testability | Quota and billing logic covered by automated tests without real API spend |

## 8. Edge cases that must be handled

- Two tabs sending at once near the quota limit.
- Client disconnects mid-stream (abort must propagate to the provider call).
- Provider returns an error after partial output.
- Provider returns no usage data (fall back to estimated tokens and flag the row).
- Stripe webhook delivered twice or out of order.
- User downgrades while a stream is in flight.
- Prompt injection or oversized input (length cap, no system prompt leakage guarantees claimed).

## 9. Data model (summary)

Detailed in ARCHITECTURE.md. Core tables: `users`, `sessions`, `accounts`, `subscriptions`, `conversations`, `messages`, `usage_ledger`, `quota_periods`, `stripe_events`.

## 10. Acceptance criteria (v1 done)

1. A new user can sign up, chat with streamed responses, and see history after refresh.
2. A Free user who exhausts quota gets a clear blocked state and an upgrade prompt.
3. Upgrading through Stripe test mode raises limits within seconds of the webhook.
4. Concurrent requests cannot push usage past the quota (proved by a test).
5. Stopping a stream saves partial output and records actual tokens.
6. CI passes lint, typecheck, and tests; the app is live at a public URL.
7. README has an architecture diagram, a demo GIF, and a short "decisions and tradeoffs" section.

## 11. Milestones

1. **Foundations**: monorepo, CI, Postgres + Drizzle schema, auth working end to end.
2. **Chat core**: streaming endpoint, conversation CRUD, chat UI.
3. **Metering**: ledger, reservation and settlement, rate limiting, usage UI.
4. **Billing**: Stripe checkout, portal, webhooks, plan enforcement.
5. **Hardening**: failure handling, tests for edge cases, observability, load check.
6. **Ship**: deploy, README, demo video, resume bullets with real numbers.

## 12. Resume metrics to capture

Record these while building so the bullets are real: p50/p95 time to first token, requests per second sustained in a load check, number of tests, percentage of concurrency-safe quota checks proven by test, cost per 1,000 requests.

## 13. Open questions

- Exact Pro price and Stripe Price IDs.
- Which Claude model for chat versus title generation (cheaper model for titles).
- Whether to add a daily spend kill-switch in v1 or v1.1.
