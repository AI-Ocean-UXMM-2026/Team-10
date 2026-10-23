'use client';
import { useEffect, useId, useRef, useState } from 'react';

export function AccountMenu({ email, active, busy, onTimer, onSignOut, onRefresh }: { email: string; active: boolean; busy: boolean; onTimer: () => void; onSignOut: () => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="account-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} disabled={busy} aria-expanded={open} aria-controls={id} onClick={() => open ? close() : setOpen(true)}>Account <span aria-hidden="true">⌄</span></button>
    {open && <div ref={panel} id={id} className="account-popover" role="region" aria-label="Your account">
      <h2>Your account</h2><p>{email}</p>
      {active && <button disabled={busy} onClick={() => { close(); onTimer(); }}>Return to Timer</button>}
      <button disabled={busy} onClick={() => { close(); onSignOut(); }}>Sign out</button>
      <button disabled={busy} onClick={() => { close(); onRefresh(); }}>Refresh status</button>
    </div>}
  </div>;
}
