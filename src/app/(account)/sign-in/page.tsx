import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { currentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/policy";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; message?: string; reauthenticate?: string }> }) {
  const params = await searchParams;
  const user = await currentUser();
  if (user && params.message === "email-verified" && user.email_confirmed_at) {
    return <AuthFrame><h1>Your email is verified!</h1><p role="status">Continue to Sign In to enter Nookstep.</p><nav className="auth-help" aria-label="Continue after verification"><Link className="button primary" href="/sign-in?reauthenticate=true" prefetch={false}>Continue to Sign In</Link></nav></AuthFrame>;
  }
  // An explicit continuation shows the sign-in form without revoking an existing session.
  if (user && params.reauthenticate !== "true") redirect("/home");
  return <AuthFrame><h1>Sign in</h1>{params.message === "password-updated" && <p role="status">Your password was updated. Sign in with your new password.</p>}<AuthForm mode="sign-in" next={safeNext(params.next)} /></AuthFrame>;
}
