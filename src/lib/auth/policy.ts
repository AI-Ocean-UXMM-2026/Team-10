export type AuthState = {
  error?: string;
  message?: string;
  fields?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
};

export function safeNext(value: unknown): string {
  // Only currently implemented private destinations are allowed. No URL decoding tricks.
  return value === "/home" ? value : "/home";
}

export function validate(form: FormData, mode: "sign-in" | "register" | "forgot-password" | "reset-password" | "resend-confirmation") {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  const fields: NonNullable<AuthState["fields"]> = {};
  if (mode !== "reset-password" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    fields.email = "Enter a valid email address.";
  }
  if (mode !== "forgot-password" && mode !== "resend-confirmation") {
    if (!password || password.length > 128) fields.password = "Enter a password of at most 128 characters.";
    if ((mode === "register" || mode === "reset-password") && password.length < 12) {
      fields.password = "Use at least 12 characters. A longer passphrase is welcome.";
    }
  }
  if ((mode === "register" || mode === "reset-password") && password !== confirmPassword) {
    fields.confirmPassword = "Passwords must match.";
  }
  return { email, password, fields, valid: Object.keys(fields).length === 0 };
}

// Call only with claims returned by Supabase getClaims(), never decoded/unverified JWTs.
export function isRecentRecovery(claims: Record<string, unknown> | undefined, now = Date.now() / 1000) {
  if (!claims || typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp <= now) return false;
  return Array.isArray(claims.amr) && claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return method === "recovery" && typeof timestamp === "number" && timestamp <= now + 30 && timestamp > now - 900;
  });
}

export function authError(error: { code?: string; status?: number } | null): string {
  if (error?.code === "email_not_confirmed") return "Confirm your email before signing in. Check your inbox and spam folder.";
  if (error?.code === "invalid_credentials") return "Email or password is incorrect.";
  if (error?.code === "weak_password") return "Choose a stronger password that meets the account password requirements.";
  if (error?.code === "same_password") return "Choose a different password from your current password.";
  if (error?.status === 429 || error?.code?.includes("rate_limit")) return "Too many attempts. Please wait before trying again.";
  return "Unable to complete this request. Please try again. If it continues, check your connection or contact support.";
}
