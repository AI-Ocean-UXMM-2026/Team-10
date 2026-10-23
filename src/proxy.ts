import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = NextResponse.next({ request });
        previous.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  try {
    await supabase.auth.getClaims();
  } catch {
    // Pages/actions still verify with Auth and fail closed; allow a recoverable UI.
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/home/:path*", "/sign-in", "/register", "/forgot-password", "/reset-password", "/auth/:path*"],
};
