import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Nookstep — Your next step', description: 'Your space. Your goal. Your next step. A cozy place to plan, focus, reflect, and keep going.' };
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
