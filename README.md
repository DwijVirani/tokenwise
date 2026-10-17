# Tokenwise

A multi-tenant streaming AI chat product with conversation history, token metering, and plan-based quotas.

> **Status:** early scaffolding. The monorepo, tooling, and package manifests are in place; feature code is not written yet. See [SPEC.md](SPEC.md) section 11 for milestones.

## What it does

- Streams Claude responses token by token.
- Saves conversations and messages per user.
- Meters every request (input tokens, output tokens, cost) in an append-only Postgres ledger.
- Enforces monthly token quotas and per-minute rate limits by reserving quota before a model call and settling it afterward.
- Sells plans through Stripe subscriptions; webhooks are the source of truth for plan state.

## Stack

Next.js (App Router), React, Tailwind, Fastify, PostgreSQL + Drizzle, Better Auth, Anthropic Claude via the Vercel AI SDK, Redis + BullMQ, Stripe, Vitest, pnpm + Turborepo.

## Repository layout

```
apps/
  web/        Next.js UI (no business logic)
  api/        Fastify service (routes, services, jobs)
packages/
  shared/     zod schemas, plan config, error codes, types
  db/         Drizzle schema and migrations
```

Details are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting started

Requires Node 22+, pnpm 10+, and Docker.

```sh
cp .env.example .env     # fill in values; never commit .env
docker compose up -d     # Postgres + Redis
pnpm install
pnpm db:migrate          # once the schema exists (milestone 1)
pnpm dev                 # web and api via Turborepo
```

For billing work, forward Stripe test-mode webhooks:

```sh
stripe listen --forward-to localhost:4000/webhooks/stripe
```

Use Stripe test keys and the mocked model stream for local runs and tests.

## Commands

| Task | Command |
|---|---|
| Dev (all) | `pnpm dev` |
| Dev (one app) | `pnpm --filter web dev` / `pnpm --filter api dev` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Generate migration | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |

CI runs lint, typecheck, and tests on every pull request.

## Documentation

- [SPEC.md](SPEC.md): product requirements, plans, acceptance criteria, milestones.
- [ARCHITECTURE.md](ARCHITECTURE.md): system design, data model, quota and billing flows.
- [AGENTS.md](AGENTS.md): conventions and invariants for contributors and coding agents.
- [CLAUDE.md](CLAUDE.md): Claude Code specifics for this repo.
