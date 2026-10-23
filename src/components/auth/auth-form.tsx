"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { forgotPassword, register, resetPassword, signIn, signOut } from "@/app/auth/actions";
import type { AuthState } from "@/lib/auth/policy";

type Mode = "sign-in" | "register" | "forgot-password" | "reset-password";
const actions = { "sign-in": signIn, register, "forgot-password": forgotPassword, "reset-password": resetPassword };
const labels = { "sign-in": "Sign in", register: "Register", "forgot-password": "Send recovery email", "reset-password": "Set new password" };

export function AuthForm({ mode, next = "/home" }: { mode: Mode; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(actions[mode], {});
  const [values, setValues] = useState({ email: "", password: "", confirmPassword: "" });
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error || state.message) feedback.current?.focus();
  }, [state]);
  const newPassword = mode === "register" || mode === "reset-password";
  return (
    <form action={action} className="auth-form" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      {mode !== "reset-password" && <div>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} autoComplete="email" required maxLength={254}
          aria-invalid={!!state.fields?.email} aria-describedby={state.fields?.email ? "email-error" : undefined} />
        {state.fields?.email && <p id="email-error">{state.fields.email}</p>}
      </div>}
      {mode !== "forgot-password" && <div>
        <label htmlFor="password">{newPassword ? "New password" : "Password"}</label>
        {newPassword && <p id="password-hint">Use 12–128 characters. A longer passphrase is welcome.</p>}
        <input id="password" name="password" type="password" value={values.password} onChange={event => setValues({ ...values, password: event.target.value })} autoComplete={newPassword ? "new-password" : "current-password"}
          required minLength={newPassword ? 12 : 1} maxLength={128} aria-invalid={!!state.fields?.password}
          aria-describedby={[newPassword ? "password-hint" : "", state.fields?.password ? "password-error" : ""].filter(Boolean).join(" ") || undefined} />
        {state.fields?.password && <p id="password-error">{state.fields.password}</p>}
      </div>}
      {newPassword && <div>
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" value={values.confirmPassword} onChange={event => setValues({ ...values, confirmPassword: event.target.value })} autoComplete="new-password" required maxLength={128}
          aria-invalid={!!state.fields?.confirmPassword} aria-describedby={state.fields?.confirmPassword ? "confirm-error" : undefined} />
        {state.fields?.confirmPassword && <p id="confirm-error">{state.fields.confirmPassword}</p>}
      </div>}
      <div ref={feedback} tabIndex={-1}>
        {state.error && <p role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
      </div>
      <button disabled={pending} type="submit">{pending ? "Please wait…" : labels[mode]}</button>
      <nav aria-label="Account help" className="auth-help">
        {mode !== "sign-in" && <Link href="/sign-in" prefetch={false}>Sign in</Link>}
        {mode === "sign-in" && <><Link href="/register" prefetch={false}>Create an account</Link><Link href="/forgot-password" prefetch={false}>Forgot password?</Link></>}
        {mode === "reset-password" && <><Link href="/forgot-password" prefetch={false}>Request a new recovery link</Link><Link href="/home" prefetch={false}>Home</Link></>}
      </nav>
    </form>
  );
}

export function SignOutForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signOut, {});
  return <form action={action} aria-busy={pending}>
    {state.error && <p role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>
  </form>;
}
