"use client";

export default function AccountError({ reset }: { reset: () => void }) {
  return <><h1>Account service unavailable</h1><p>Check your connection and try again.</p><button onClick={reset}>Try again</button></>;
}
