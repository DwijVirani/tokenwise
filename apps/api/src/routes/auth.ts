import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { Auth } from "../lib/auth";

// Bridges Fastify to Better Auth's Fetch-style handler, mounted under /auth/*.
export function authRoutes(auth: Auth) {
  return async (app: FastifyInstance) => {
    app.route({
      method: ["GET", "POST"],
      url: "/auth/*",
      handler: async (request, reply) => {
        const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
        const hasBody = request.method !== "GET" && request.body !== undefined;
        const response = await auth.handler(
          new Request(url, {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            body: hasBody ? JSON.stringify(request.body) : undefined,
          }),
        );

        reply.code(response.status);
        response.headers.forEach((value, key) => {
          if (key !== "set-cookie") reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) reply.header("set-cookie", cookies);
        return reply.send(response.body ? await response.text() : null);
      },
    });
  };
}
