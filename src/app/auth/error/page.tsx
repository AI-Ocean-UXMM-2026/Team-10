import Link from "next/link";

export default function AuthError() {
  return <main className="mx-auto w-full max-w-lg p-6"><h1 className="text-2xl font-semibold">This link could not be verified</h1><p className="my-4">The link may be invalid, expired, already used, or opened in a different browser. Try signing in after confirming your email, or request a new password recovery link. If the service was unavailable, try again.</p><nav aria-label="Account recovery" className="flex flex-wrap gap-4 underline"><Link href="/sign-in">Sign in</Link><Link href="/forgot-password">Request recovery email</Link><Link href="/register">Register</Link></nav></main>;
}
