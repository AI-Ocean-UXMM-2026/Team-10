import Link from 'next/link';
import { ExampleRoom } from '@/components/room/example-room';
export function AuthFrame({ children, register = false }: { children: React.ReactNode; register?: boolean }) {
  return <div className="auth-page"><header className="app-header"><Link className="wordmark" href="/">nookstep<span>✦</span></Link></header><main id="main-content" className="auth-layout"><section className="auth-shell">{children}</section><aside className="auth-art"><p className="eyebrow">YOUR SPACE. YOUR GOAL. YOUR NEXT STEP.</p><h2>{register ? 'Make space for your first step.' : 'Return to your desk.'}</h2><p>{register ? 'Start with a small goal. Make this space your own.' : "Your space is here whenever you're ready."}</p><ExampleRoom /></aside></main></div>;
}
