import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import "@/app/(account)/auth.css";

const reasons: Record<string, string> = {
  browser: "This link needs the browser that requested it to finish signing you in. Your email may already be confirmed. Try signing in with your password. If sign-in still asks for verification, request a new confirmation email. For a password reset, request a new recovery email and open it in the browser where you requested it.",
  "expired-or-used": "This one-time link has expired or has already been used. Try signing in if you already confirmed your email. Otherwise, request a new confirmation email and open only the latest link.",
  session: "Your email link was accepted, but we couldn’t finish opening your session. Try signing in. If you were resetting your password, request a new recovery email.",
  invalid: "The link may be incomplete, expired, already used, or opened in a different browser. Your email may already be confirmed; try signing in. If you still need verification or a password reset, request a new email using the links below.",
};

type Props = { searchParams: Promise<{ reason?: string }> };

export default function AuthError(props: Props) {
  return <Suspense fallback={<AuthFrame><p role="status">Opening account help…</p></AuthFrame>}><ErrorDetails {...props} /></Suspense>;
}

async function ErrorDetails({ searchParams }: Props) {
  const { reason } = await searchParams;
  const message = reason && Object.hasOwn(reasons, reason) ? reasons[reason] : reasons.invalid;
  return <AuthFrame><h1>We couldn’t complete this link</h1><p role="alert">{message}</p><nav aria-label="Account recovery" className="auth-help"><Link href="/sign-in" prefetch={false}>Sign in</Link><Link href="/register?resend=true" prefetch={false}>Request confirmation email</Link><Link href="/forgot-password" prefetch={false}>Request recovery email</Link></nav></AuthFrame>;
}
