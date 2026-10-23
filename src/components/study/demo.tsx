'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RoomEditor } from '@/components/room/room-editor';
import { clockText } from '@/lib/study/model';
import { createItem } from '@/lib/room/room';
import type { RoomState } from '@/lib/room/roomState';
import type { CatalogItem } from '@/lib/study/data';
const sampleItems: CatalogItem[] = [
  { id: 'demo-desk', name: 'Sample desk', category: 'Demo furniture', price_coins: 0, surface_type: 'floor', room_kind: 'desk', asset_path: '/assets/room/normalized/desk/desk-frontLeft.png', is_active: false },
  { id: 'demo-chair', name: 'Sample chair', category: 'Demo furniture', price_coins: 0, surface_type: 'floor', room_kind: 'chair', asset_path: '/assets/room/normalized/chair/chair-frontLeft.png', is_active: false },
];
export function Demo() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [room, setRoom] = useState<RoomState>({ version: 2, items: [createItem('demo-desk', 'desk', { x: 2, y: 2 })], decorations: [], wallDecorations: [] });
  const [saved, setSaved] = useState(false);
  const [reflection, setReflection] = useState('');
  const [nextStep, setNextStep] = useState('');
  useEffect(() => {
    if (seconds === null || seconds <= 0) return;
    const started = performance.now(); const initial = seconds;
    const timer = setInterval(() => setSeconds(Math.max(0, initial - Math.floor((performance.now() - started) / 1000))), 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return <div className="workspace"><header className="app-header"><Link className="wordmark" href="/">nookstep<span>✦</span></Link><span className="badge">DEMO · SAMPLE DATA</span><Link href="/home">Your real study space →</Link></header><main className="app-main" id="main-content"><div className="notice"><strong>15-second accelerated Demo</strong><p>This walkthrough uses sample data in memory. It earns no spendable coins, writes no study history, and does not count as real study time. Refresh resets this demo only.</p></div><section className="card focus-card"><p className="eyebrow">PLAN → FOCUS → REFLECT → CONTINUE</p><h1>Try one small step.</h1><p>Sample Practice quest: Integration by parts</p><p className="finish-line">Finish Line: Work through one example and identify the tricky step.</p>{seconds === null ? <button className="primary" onClick={() => setSeconds(15)}>Start 15-second Demo</button> : seconds > 0 ? <><p role="status">Demo running · accelerated sample</p><div className="countdown" role="timer" aria-live="off">{clockText(seconds)}</div></> : <><h2>Demo complete · 0 real coins</h2><p role="status">A real qualifying quest must run for its full planned active time before the server awards coins.</p><label htmlFor="demo-reflection">Learning Check · optional demo answer</label><p>What did you complete? What was difficult or incorrect?</p><textarea id="demo-reflection" value={reflection} onChange={e => setReflection(e.target.value)} maxLength={2000} /><label htmlFor="demo-next">What will you do first next time?</label><textarea id="demo-next" value={nextStep} onChange={e => setNextStep(e.target.value)} maxLength={240} /><p>These notes are sample input and are not saved to your account.</p></>}</section>{seconds === 0 && <RoomEditor room={room} catalog={sampleItems} owned={sampleItems.map(i => i.id)} busy={false} dirty={!saved} conflict={false} onChange={value => { setRoom(value); setSaved(false); }} onSave={() => setSaved(true)} onReload={() => { setRoom({ version: 2, items: [], decorations: [], wallDecorations: [] }); setSaved(false); }} />} {saved && <p role="status">Demo layout kept in memory only. No account data changed.</p>}</main></div>;
}
