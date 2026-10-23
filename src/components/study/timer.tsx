'use client';
import { useEffect, useRef, useState } from 'react';
import { clockText, modes, remainingSeconds, type QuestResult } from '@/lib/study/model';
export function Timer({ result, busy, uncertain, pendingLabel, onAction, onSync }: { result: QuestResult; pendingLabel?: string; busy: boolean; uncertain: boolean; onAction: (action: 'pause' | 'resume' | 'cancel' | 'complete') => void; onSync: () => void }) {
  const [sample, setSample] = useState({ result, elapsed: 0 });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const zeroChecked = useRef(false);
  useEffect(() => {
    const baseline = performance.now();
    const id = window.setInterval(() => setSample({ result, elapsed: (performance.now() - baseline) / 1000 }), 250);
    return () => clearInterval(id);
  }, [result]);
  const left = remainingSeconds(result, sample.result === result ? sample.elapsed : 0);
  useEffect(() => {
    if (left > 0) zeroChecked.current = false;
    if (left === 0 && !busy && !uncertain && !zeroChecked.current) { zeroChecked.current = true; onSync(); }
  }, [left, busy, uncertain, onSync]);
  const quest = result.session;
  if (!quest) return null;
  const progress = Math.max(0, Math.min(100, (1 - left / (quest.planned_minutes * 60)) * 100));
  return <section className={`card focus-card ${quest.status === 'paused' ? 'is-paused' : ''}`}><div className="timer-state badge">{uncertain ? 'Sync needed' : busy ? 'Updating…' : quest.status === 'paused' ? 'On a break' : left === 0 ? 'Awaiting confirmation' : 'In focus'}</div><p className="eyebrow">{modes[quest.study_mode].label} · {quest.planned_minutes} MINUTES</p><h1>{quest.topic}</h1>
    <p role="status">{uncertain ? 'Offline / synchronization uncertain — time shown is an estimate.' : busy ? pendingLabel || 'Synchronizing timer…' : quest.status === 'paused' ? 'Paused · take your time.' : left === 0 ? 'Time reached locally; awaiting server confirmation. Choose Complete Study Quest to check and record your session.' : 'Running · one small step at a time.'}</p>
    <div className="finish-line-panel"><h2>Your Finish Line</h2><p className="finish-line user-text">{quest.finish_line}</p></div>
    <div className="countdown" role="timer" aria-live="off" aria-label="Estimated time remaining">{clockText(left)}</div>
    <div className="timer-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div><p className="timer-caption">{quest.status === 'paused' ? 'Your time is yours. Resume when you’re ready.' : 'A little attention, one step at a time.'}</p><div className="actions"><button className="primary" disabled={busy || uncertain} onClick={() => onAction(quest.status === 'paused' ? 'resume' : 'pause')}>{quest.status === 'paused' ? 'Resume' : 'Pause'}</button>{left === 0 && quest.status === 'running' && <button className="primary" disabled={busy || uncertain} onClick={() => onAction('complete')}>Complete Study Quest</button>}<button disabled={busy || uncertain} onClick={() => setConfirmCancel(true)}>Cancel quest</button></div>
    {confirmCancel && <div className="notice" role="group" aria-label="Confirm cancellation"><p>End this quest? You won’t earn completion coins.</p><div className="actions"><button className="danger" disabled={busy} onClick={() => { setConfirmCancel(false); onAction('cancel'); }}>Yes, cancel quest</button><button onClick={() => setConfirmCancel(false)}>Keep studying</button></div></div>}
    <small>Running time continues when you leave. Paused time doesn’t count. Unresolved quests expire after 24 hours. This timer records session activity, not learning or attention.</small>
  </section>;
}
