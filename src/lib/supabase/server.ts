import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cookieOptions, supabaseConfig } from "./config";

// Read-only rendering relies on Proxy to persist refreshes. Mutations must be writable.
export async function createClient(writable = false) {
  // Cookies can be available during runtime prerendering. Supabase's session
  // expiry checks read the clock, so defer client initialization to a real request.
  await connection();
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookieOptions,
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values: { name: string; value: string; options: CookieOptions }[]) {
        if (!writable) return;
        values.forEach(({ name, value, options }) => store.set(name, value, options));
      },
    },
  });
}
