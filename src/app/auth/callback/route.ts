import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRecentRecovery } from "@/lib/auth/policy";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  let destination = "/auth/error";
  if (code) {
    try {
      const supabase = await createClient(true);
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error?.code === "pkce_code_verifier_not_found" || error?.code === "bad_code_verifier") destination = "/auth/error?reason=browser";
      if (!error) {
        destination = "/auth/error?reason=session";
        const { data, error: claimsError } = await supabase.auth.getClaims();
        if (!claimsError && data) destination = isRecentRecovery(data.claims) ? "/reset-password" : "/sign-in?message=email-verified";
      }
    } catch { /* Never reflect provider messages or tokens. */ }
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
