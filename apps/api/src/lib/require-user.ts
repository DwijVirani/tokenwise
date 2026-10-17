import { apiError, ERROR_HTTP_STATUS } from "@tokenwise/shared";
import { fromNodeHeaders } from "better-auth/node";
import type { preHandlerAsyncHookHandler } from "fastify";
import type { Auth, SessionUser } from "./auth";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

// Resolves the session from the cookie and attaches request.user. The user id
// always comes from the session, never from the client (AGENTS.md invariant 5).
export function createRequireUser(auth: Auth): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      return reply
        .code(ERROR_HTTP_STATUS.UNAUTHENTICATED)
        .send(apiError("UNAUTHENTICATED", "Sign in required."));
    }
    request.user = session.user;
  };
}
