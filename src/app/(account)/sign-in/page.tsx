import { AuthFrame } from "@/components/auth/auth-frame";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { currentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/policy";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; message?: string }> }) {
  const params = await searchParams;
  if (await currentUser()) redirect("/home");
  return <AuthFrame><h1>Sign in</h1>{params.message === "password-updated" && <p role="status">Your password was updated. Sign in with your new password.</p>}<AuthForm mode="sign-in" next={safeNext(params.next)} /></AuthFrame>;
}
