"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recoveryAllowed } from "@/lib/auth/session";
import { authError, safeNext, validate, type AuthState } from "@/lib/auth/policy";

async function appOrigin() {
  // Server Actions enforce same-origin POSTs. Do not trust forwarded host for email links.
  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("Missing request origin");
  const url = new URL(origin);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Invalid request origin");
  }
  return url.origin;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const input = validate(form, "sign-in");
  if (!input.valid) return { fields: input.fields, error: "Check the highlighted fields." };
  try {
    const supabase = await createClient(true);
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) return { error: authError(error) };
  } catch { return { error: authError(null) }; }
  revalidatePath("/", "layout");
  redirect(safeNext(form.get("next")));
}

export async function register(_: AuthState, form: FormData): Promise<AuthState> {
  const input = validate(form, "register");
  if (!input.valid) return { fields: input.fields, error: "Check the highlighted fields." };
  try {
    const supabase = await createClient(true);
    const { data, error } = await supabase.auth.signUp({
      email: input.email, password: input.password,
      options: { emailRedirectTo: `${await appOrigin()}/auth/callback` },
    });
    if (error) return { error: authError(error) };
    if (!data.session) return { message: "If registration is available for this address, check your inbox and spam folder. Open the confirmation email and click its link in this same browser and device. If you already have an account, sign in or reset your password." };
  } catch { return { error: authError(null) }; }
  revalidatePath("/", "layout");
  redirect("/home");
}

export async function resendConfirmation(_: AuthState, form: FormData): Promise<AuthState> {
  const input = validate(form, "resend-confirmation");
  if (!input.valid) return { fields: input.fields, error: "Check the highlighted fields." };
  try {
    const supabase = await createClient(true);
    const { error } = await supabase.auth.resend({
      type: "signup", email: input.email,
      options: { emailRedirectTo: `${await appOrigin()}/auth/callback` },
    });
    // Match recovery's anti-enumeration policy, including truthful outage feedback.
    if (error && (error.status === undefined || error.status >= 500 || error.status === 429 || error.code?.includes("rate_limit"))) {
      return { error: authError(error) };
    }
  } catch { return { error: authError(null) }; }
  return { message: "If this address has an account awaiting verification, you will receive a new confirmation email. Check your inbox and spam folder. Open the latest confirmation email and click its link in this same browser and device. If your email is already verified, sign in." };
}

export async function forgotPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const input = validate(form, "forgot-password");
  if (!input.valid) return { fields: input.fields, error: "Check the highlighted fields." };
  try {
    const supabase = await createClient(true);
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${await appOrigin()}/auth/callback`,
    });
    // Hide account-specific errors while truthfully reporting service/rate-limit failures.
    if (error && (error.status === undefined || error.status >= 500 || error.status === 429 || error.code?.includes("rate_limit"))) {
      return { error: authError(error) };
    }
  } catch { return { error: authError(null) }; }
  return { message: "If an account exists for this address, you will receive a password reset email. Check your inbox and spam folder. If no message arrives, wait a few minutes and try again." };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const input = validate(form, "reset-password");
  if (!input.valid) return { fields: input.fields, error: "Check the highlighted fields." };
  if (!await recoveryAllowed()) return { error: "Your recovery link is invalid or expired. Request a new link from Forgot password." };
  try {
    const supabase = await createClient(true);
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) return { error: authError(error) };
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) return { message: "Your password was updated. Signing out failed; use Sign out on Home, then sign in with your new password." };
  } catch {
    return { error: "The request was interrupted. Your password may have changed. Try signing in with your new password or request a new recovery link." };
  }
  revalidatePath("/", "layout");
  redirect("/sign-in?message=password-updated");
}

export async function signOut(): Promise<AuthState> {
  try {
    const supabase = await createClient(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "Could not sign out. Check your connection and try again." };
  } catch { return { error: "Could not sign out. Check your connection and try again." }; }
  revalidatePath("/", "layout");
  redirect("/sign-in");
}
