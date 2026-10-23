import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  let destination = "/auth/error";
  if (token_hash && (type === "email" || type === "signup")) {
    try {
      const supabase = await createClient(true);
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (error?.code === "otp_expired") destination = "/auth/error?reason=expired-or-used";
      if (!error) {
        destination = "/auth/error?reason=session";
        const { data, error: claimsError } = await supabase.auth.getClaims();
        if (!claimsError && data) {
          destination = "/sign-in?message=email-verified";
        }
      }
    } catch { /* Never reflect provider messages or tokens. */ }
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
