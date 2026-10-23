'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

// A native modal keeps keyboard focus inside the decision and restores it on close.
export function ConfirmationDialog({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    element?.querySelector<HTMLElement>('[data-dialog-default]')?.focus();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2>{children}
  </dialog>;
}
