# CLAUDE.md

@AGENTS.md

Claude Code specifics for this repo. Shared rules, commands, and invariants are in AGENTS.md (imported above). Product requirements are in SPEC.md and system design is in ARCHITECTURE.md; read them when a task touches behavior or structure.

## How to work here

- Start non-trivial tasks by reading the relevant section of SPEC.md and ARCHITECTURE.md, then state a short plan before editing.
- Work milestone by milestone as listed in SPEC.md section 11. Do not start a later milestone's work early unless asked.
- Make the smallest change that satisfies the task. Match surrounding code style.
- After changes, run `pnpm lint && pnpm typecheck && pnpm test` (or the narrower `--filter` version) and report actual results. Do not claim success without running them.
- When a command fails, read the error and fix the cause. Do not retry blindly or disable the check.

## Useful starting points

| If the task is about | Look at |
|---|---|
| Streaming chat endpoint | `apps/api/src/routes/chat.ts`, `services/chat.ts`, `lib/ai.ts` |
| Quota reserve and settle | `apps/api/src/services/quota.ts`, Redis Lua scripts in `lib/redis/` |
| Billing and webhooks | `apps/api/src/services/billing.ts`, `routes/webhooks.ts` |
| Schema and migrations | `packages/db` |
| Plan limits and error codes | `packages/shared` |
| Chat UI | `apps/web/app/chat`, `apps/web/components/chat` |

(Paths are the intended layout; confirm they exist before relying on them.)

## Guardrails specific to Claude Code

- Never run commands against production databases, production Stripe keys, or deployed infrastructure.
- Do not read or print the contents of `.env` files. Refer to variable names from `.env.example`.
- Use Stripe test mode and mocked model streams in all tests and local runs.
- Before writing code that uses the Vercel AI SDK or Better Auth, check the installed version's docs or types in `node_modules`. Their APIs change between versions, so do not rely on memory.
- For destructive or hard-to-reverse actions (dropping tables, force pushes, mass deletes), stop and ask first.
- Prefer editing existing files over creating new ones. New files should follow the layout in ARCHITECTURE.md section 2.

## Context hygiene

- Keep this file and AGENTS.md short and current. If you discover a repeated mistake or a missing convention, propose an addition rather than working around it.
- Put long-lived decisions in ARCHITECTURE.md (a new row in the decisions table), not in chat history.
- When a task changes behavior, update SPEC.md or ARCHITECTURE.md in the same change.

## Suggested prompts to start each milestone

1. "Set up the pnpm + Turborepo monorepo per ARCHITECTURE.md section 2, with CI running lint, typecheck, and tests."
2. "Implement the Drizzle schema from ARCHITECTURE.md section 9 and the first migration, with Docker Compose for Postgres and Redis."
3. "Implement Better Auth in apps/api and the web auth client, with shared cookies across subdomains."
4. "Implement POST /chat streaming with the AI SDK behind lib/ai.ts, including abort handling and a deterministic mock for tests."
5. "Implement quota reserve and settle with the Redis Lua script and tests that prove concurrent requests cannot exceed the limit."
6. "Implement Stripe checkout, portal, and idempotent webhooks with fixture-based tests."
