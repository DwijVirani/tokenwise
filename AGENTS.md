# AGENTS.md

Instructions for AI coding agents and human contributors working in this repo. Read SPEC.md for what we are building and ARCHITECTURE.md for how. This file covers how to work here.

## Project

Tokenwise: a multi-tenant streaming AI chat app with token metering, plan quotas, and Stripe billing.

Stack: Next.js (App Router) + React + Tailwind + shadcn/ui, Fastify API, PostgreSQL + Drizzle, Better Auth, Anthropic Claude via the Vercel AI SDK, Redis + BullMQ, Stripe, Vitest, pnpm + Turborepo.

## Repository map

- `apps/web` — Next.js UI. No business logic, no direct DB, Redis, Stripe-secret, or Anthropic access.
- `apps/api` — Fastify service. All business logic lives in `src/services`. Routes stay thin.
- `packages/shared` — zod schemas, plan config, error codes, shared types.
- `packages/db` — Drizzle schema and migrations.

## Commands

Run from the repo root unless noted.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Start local services | `docker compose up -d` |
| Run everything in dev | `pnpm dev` |
| Run one app | `pnpm --filter web dev` / `pnpm --filter api dev` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test all | `pnpm test` |
| Test one package | `pnpm --filter api test` |
| Generate migration | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |
| Stripe webhooks locally | `stripe listen --forward-to localhost:4000/webhooks/stripe` |

Before saying a task is done, run `pnpm lint && pnpm typecheck && pnpm test`. If a command does not exist yet, say so rather than inventing output.

## Code style

- TypeScript strict mode. No `any` unless commented with a reason; prefer `unknown` and narrow.
- Validate every external input (HTTP bodies, webhooks, env) with zod. Derive types from schemas.
- Keep route handlers thin: parse, call a service, map the result. Logic belongs in services.
- Prefer small pure functions for quota math, plan resolution, and token estimation so they are easy to test.
- Money is integer micro-dollars. Time is stored in UTC.
- Use named exports. Use the shared error shape and codes from `packages/shared`.
- Logging uses pino with a request id. Never log secrets, full prompts, or full message bodies.
- Follow existing patterns in the nearest file before introducing a new one.

## Invariants (do not break these)

1. Postgres `usage_ledger` is the source of truth for usage. It is append-only: never update or delete rows.
2. Quota is reserved before a model call and settled after it. No model call may start without a successful reservation.
3. Plan state changes only from verified Stripe webhooks. Never trust the checkout redirect.
4. Stripe webhook handling is idempotent (unique `stripe_events.id`) and verifies the signature on the raw body.
5. Every query touching user data is scoped by the authenticated `user_id`. Never accept a user id from the client.
6. If Redis is down, chat fails closed. Do not allow unmetered model calls.
7. Client disconnect or stop must abort the provider request and settle actual tokens.
8. Wrap the AI SDK in `apps/api/src/lib/ai.ts`; do not import it across the codebase.

## Testing rules

- Add or update tests with every behavior change. Bug fixes start with a failing test.
- Quota, concurrency, webhook, and ownership logic need integration tests against real Postgres and Redis (containers), not mocks.
- Never call the real Anthropic API or Stripe in automated tests. Use the deterministic mock stream and Stripe fixtures.
- Test names describe behavior: `rejects a request when reserved plus used exceeds the limit`.

## Database and migrations

- Change the schema in `packages/db`, then generate a migration. Never edit an applied migration.
- Migrations must be backward compatible with the currently deployed API version (expand, then contract).
- Add indexes for any new query path you introduce.

## Security rules

- Secrets live in environment variables only. Update `.env.example` (names only, no values) when adding one.
- Never commit `.env*` files, API keys, or Stripe secrets.
- Sanitize rendered model output. No raw HTML from the model in the UI.
- Enforce input size limits on every endpoint that accepts text.

## Git and PRs

- Branch names: `feat/...`, `fix/...`, `chore/...`.
- Conventional Commits (`feat(api): add quota reservation script`).
- Small PRs. Each PR states what changed, why, and how it was tested.
- CI must pass (lint, typecheck, tests) before merge.

## Boundaries for agents

Ask before:
- Adding or upgrading a major dependency, or changing the stack choices in ARCHITECTURE.md.
- Changing plan limits, pricing logic, or the ledger or quota schema.
- Running destructive database commands or touching production configuration.

Never:
- Disable tests, lint rules, or type checks to make a build pass.
- Commit secrets or real customer data.
- Bypass the reservation and settlement flow "just for testing".

## When requirements are unclear

Check SPEC.md first, then ARCHITECTURE.md. If the answer is not there, state the assumption you are making and keep it easy to change, or ask. Update the docs in the same PR if behavior or design changes.

## Definition of done

- Behavior matches SPEC.md acceptance criteria for the feature.
- Tests added or updated and passing locally.
- Lint and typecheck clean.
- Docs updated if architecture, env vars, or commands changed.
- No new secrets, no leftover debug logging.
