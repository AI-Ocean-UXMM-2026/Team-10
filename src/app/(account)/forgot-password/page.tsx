import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthForm } from "@/components/auth/auth-form";

export default function ForgotPassword() {
  return <AuthFrame><h1>Forgot password?</h1><p>Enter your account email to request a recovery link.</p><AuthForm mode="forgot-password" /></AuthFrame>;
}
