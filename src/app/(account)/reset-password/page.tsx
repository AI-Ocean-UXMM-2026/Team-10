import { AuthFrame } from "@/components/auth/auth-frame";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { recoveryAllowed } from "@/lib/auth/session";

export default async function ResetPassword() {
  if (!await recoveryAllowed()) return <AuthFrame><h1>Recovery link required</h1><p>This recovery session is missing, invalid, or expired. Open the latest link from your email and set your password within 15 minutes.</p><Link href="/forgot-password">Request a new recovery link</Link><p><Link href="/sign-in">Back to sign in</Link></p></AuthFrame>;
  return <AuthFrame><h1>Set a new password</h1><p>Choose a new password within 15 minutes of opening your recovery link.</p><AuthForm mode="reset-password" /></AuthFrame>;
}
