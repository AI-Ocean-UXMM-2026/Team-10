'use client';
import { useState } from 'react';
import { modes, type Quest } from '@/lib/study/model';
export function Completion({ quest, reward, busy, onSave }: { quest: Quest; reward: number; busy: boolean; onSave: (target: 'reflection' | 'next_step', text: string | null) => Promise<void> }) {
  const [reflection, setReflection] = useState(quest.reflection_text ?? '');
  const [nextStep, setNextStep] = useState(quest.next_step_text ?? '');
  const [error, setError] = useState('');
  function save(target: 'reflection' | 'next_step', text: string | null) {
    if (text !== null && (!text.trim() || [...text.trim()].length > (target === 'reflection' ? 2000 : 240))) { setError('Type an answer within the limit, or choose Skip.'); return; }
    setError(''); void onSave(target, text?.trim() ?? null);
  }
  return <section className="completion-page"><div className="card reward-card"><span className="completion-mark" aria-hidden="true">✓</span><p className="eyebrow">ONE STEP FORWARD</p><h1>Study Quest completed.</h1><p>{quest.topic} · {quest.planned_minutes} minutes</p><strong className="reward">{reward > 0 ? `+${reward} coins confirmed` : 'Completed · 0 coins'}</strong><p>{reward === 0 ? 'Coins start at 10 planned minutes.' : 'Your reward is recorded. Answering below is optional.'}</p><small>A completed session is activity, not a measure of learning.</small></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="two-column"><section className="card followup-card"><p className="eyebrow">REFLECT · OPTIONAL</p><h2>Learning Check</h2><p>{modes[quest.study_mode].prompt}</p>{quest.reflection_status === 'pending' ? <><label htmlFor="reflection">Your reflection (up to 2,000 characters)</label><textarea placeholder="A small insight, a question, or something to practise…" id="reflection" maxLength={2000} value={reflection} onChange={e => setReflection(e.target.value)} /><div className="actions"><button className="primary" disabled={busy} onClick={() => save('reflection', reflection)}>Submit</button><button disabled={busy} onClick={() => save('reflection', null)}>Skip Learning Check</button></div></> : <><p role="status">{quest.reflection_status === 'answered' ? 'Reflection saved' : 'Learning Check skipped'}</p>{quest.reflection_text && <p className="user-text">{quest.reflection_text}</p>}</>}</section>
    <section className="card followup-card"><p className="eyebrow">CONTINUE · OPTIONAL</p><h2>Your Next Step</h2><p>What will you do first next time?</p>{quest.next_step_status === 'pending' ? <><label htmlFor="next-step">Next Step (up to 240 characters)</label><textarea placeholder="Next time, I’ll start by…" id="next-step" maxLength={240} value={nextStep} onChange={e => setNextStep(e.target.value)} /><div className="actions"><button className="primary" disabled={busy} onClick={() => save('next_step', nextStep)}>Save Next Step</button><button disabled={busy} onClick={() => save('next_step', null)}>Skip Next Step</button></div></> : <><p role="status">{quest.next_step_status === 'saved' ? 'Next Step saved' : 'Next Step skipped'}</p>{quest.next_step_text && <p className="user-text">{quest.next_step_text}</p>}</>}</section></div>
  </section>;
}
