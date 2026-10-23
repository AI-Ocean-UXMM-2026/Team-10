import { AuthFrame } from "@/components/auth/auth-frame";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { currentUser } from "@/lib/auth/session";

export default async function Register({ searchParams }: { searchParams: Promise<{ resend?: string }> }) {
  if (await currentUser()) redirect("/home");
  if ((await searchParams).resend === "true") return <AuthFrame register><h1>Request a confirmation email</h1><p>Enter the email you registered with. If it still needs verification, we’ll send a new link.</p><AuthForm key="resend-confirmation" mode="resend-confirmation" /></AuthFrame>;
  return <AuthFrame register><h1>Create your account</h1><p>Register with your email address and a Nookstep password.</p><AuthForm key="register" mode="register" /></AuthFrame>;
}
