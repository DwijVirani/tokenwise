import { createAuthClient } from "better-auth/react";

// Talks to the API's Better Auth mount; cookies are sent cross-origin (CORS allows credentials).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  basePath: "/auth",
  fetchOptions: { credentials: "include" },
});
