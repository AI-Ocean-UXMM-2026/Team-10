import { AuthFrame } from "@/components/auth/auth-frame";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { currentUser } from "@/lib/auth/session";

export default async function Register() {
  if (await currentUser()) redirect("/home");
  return <AuthFrame register><h1>Create your account</h1><p>Register with your email address and a Nookstep password.</p><AuthForm mode="register" /></AuthFrame>;
}
