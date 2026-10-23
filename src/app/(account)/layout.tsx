import { Suspense } from 'react';
import './auth.css';
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main id="main-content" className="loading-page"><p role="status">Opening your study space…</p></main>}>{children}</Suspense>;
}
