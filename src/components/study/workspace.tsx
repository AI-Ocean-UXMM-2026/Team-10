'use client';
import { ConfirmationDialog } from './confirmation-dialog';
import { AccountMenu } from './account-menu';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { activeQuest, modes, type Quest, type QuestInput, type QuestResult } from '@/lib/study/model';
import { loadSnapshot, saveRoomLayout, canSaveRoomSurfaces, rpc, resultMessages, type Snapshot, type CatalogItem } from '@/lib/study/data';
import { entityList } from '@/lib/room/editing';
import type { RoomState } from '@/lib/room/roomState';
import { QuestForm } from './quest-form';
import { Timer } from './timer';
import { Completion } from './completion';
import { Shop } from './shop';
import { RoomScene } from '../room/room-scene';
import { RoomEditor } from '../room/room-editor';
type View = 'home' | 'compose' | 'timer' | 'completion' | 'shop' | 'editor';
function viewFromUrl(): View {
  const value = window.location.hash.slice(1);
  return ['compose', 'timer', 'completion', 'shop', 'editor'].includes(value) ? value as View : 'home';
}
function subscribeToView(change: () => void) {
  window.addEventListener('nookstep-view', change);
  return () => window.removeEventListener('nookstep-view', change);
}
export function Workspace({ email, userId, initial, signOut }: { email: string; userId: string; initial: Snapshot | null; signOut: ReactNode }) {
  const [data, setData] = useState(initial);
  const navigation = useRef({ index: 0, view: null as View | null, restoring: false, allowLeave: false, pending: null as { view: View; delta: number } | null });
  const view = useSyncExternalStore(subscribeToView, () => navigation.current.view ?? viewFromUrl(), () => 'home' as View);
  function setView(next: View) {
    const url = new URL(window.location.href);
    url.hash = next === 'home' ? '' : next;
    if (url.href !== window.location.href) {
      const index = navigation.current.index + 1;
      window.history.pushState({ ...window.history.state, nookstepViewIndex: index }, '', url);
      navigation.current.index = index;
    }
    navigation.current.pending = null;
    navigation.current.view = next;
    window.dispatchEvent(new Event('nookstep-view'));
  }
  const [bookmark, setBookmark] = useState<Quest | null>(null);
  const [completion, setCompletion] = useState<{ quest: Quest; reward: number } | null>(initial?.followup ? { quest: initial.followup, reward: initial.followupReward } : null);
  const [draft, setDraft] = useState<RoomState | null>(null);
  const [draftRevision, setDraftRevision] = useState(initial?.room.room_revision ?? 0);
  const revisionRef = useRef(draftRevision); revisionRef.current = draftRevision;
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [timerPending, setTimerPending] = useState('');
  const [uncertain, setUncertain] = useState(!initial);
  const uncertainRef = useRef(uncertain); uncertainRef.current = uncertain;
  const [syncNotice, setSyncNotice] = useState('');
  const [message, setMessage] = useState(initial ? '' : 'Your saved progress could not be loaded. Connect and retry to check your saved progress.');
  const [conflict, setConflict] = useState(false);
  const [leaveTo, setLeaveTo] = useState<View | 'signout' | null>(null);
  const [signOutReady, setSignOutReady] = useState(false);
  const [revertReady, setRevertReady] = useState(false);
  const lock = useRef(false);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(data?.room.layout);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const questId = useRef(data?.quest.session?.id); questId.current = data?.quest.session?.id;
  const originalUser = useRef<string | null>(userId);
  useEffect(() => {
    const client = createClient();
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (originalUser.current && session?.user.id && originalUser.current !== session.user.id)) {
        // Clear private React state before any route transition or other-account render.
        setData(null); setDraft(null); setCompletion(null); window.location.replace('/sign-in');
      }
      if (session?.user.id) originalUser.current ??= session.user.id;
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const offline = () => { setSyncNotice(''); setUncertain(true); setMessage('Connection lost. Timer and mutations are not synchronized.'); };
    window.addEventListener('beforeunload', before); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('beforeunload', before); window.removeEventListener('offline', offline); };
  }, []);
  useEffect(() => {
    const nav = navigation.current;
    nav.index = window.history.state?.nookstepViewIndex ?? 0;
    window.history.replaceState({ ...window.history.state, nookstepViewIndex: nav.index }, '', window.location.href);
    nav.view = viewFromUrl();
    const back = (event: PopStateEvent) => {
      // Restore the current entry before asking about a draft. Traversing instead
      // of pushing another entry preserves Forward when the user chooses Stay.
      if (nav.restoring) {
        nav.restoring = false;
        if (nav.pending) setLeaveTo(nav.pending.view);
        return;
      }
      const next = viewFromUrl();
      const index = event.state?.nookstepViewIndex ?? 0;
      const delta = index - nav.index;
      if (!nav.allowLeave && (dirtyRef.current || lock.current) && delta !== 0) {
        nav.pending = dirtyRef.current ? { view: next, delta } : null;
        nav.restoring = true;
        window.history.go(-delta);
        return;
      }
      nav.allowLeave = false;
      nav.index = index;
      nav.pending = null;
      nav.view = next;
      window.dispatchEvent(new Event('nookstep-view'));
      setSignOutReady(false);
      if (next !== 'editor') { setDraft(null); setConflict(false); }
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('#main-content h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }, [view]);
  const sync = useCallback(async (manual = false) => {
    if (lock.current) return;
    const recovering = uncertainRef.current;
    if (manual) setSyncNotice('');
    lock.current = true; setBusy(true);
    try {
      const fresh = await loadSnapshot(createClient());
      if (dirtyRef.current && fresh.room.room_revision !== revisionRef.current) { setConflict(true); setMessage('A newer saved room is available. Your draft is retained; load the saved room before editing again.'); }
      if (!dirtyRef.current) {
        setDraft(current => current ? fresh.room.layout : null);
        setDraftRevision(fresh.room.room_revision);
      }
      setData(fresh); setUncertain(false);
      if (fresh.followup) setCompletion({ quest: fresh.followup, reward: fresh.followupReward });
      if (!dirtyRef.current || fresh.room.room_revision === revisionRef.current) {
        if (manual || recovering) setMessage('');
        if (manual) setSyncNotice('Progress refreshed.');
      }
    } catch { setSyncNotice(''); setUncertain(true); setMessage('Could not refresh your progress. Your last loaded state may be stale. Reconnect and try again.'); }
    finally { lock.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    if (!syncNotice) return;
    const timeout = window.setTimeout(() => setSyncNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [syncNotice]);
  useEffect(() => {
    const visible = () => { if (!document.hidden) void sync(); };
    const interval = window.setInterval(() => { if (!document.hidden && questId.current) void sync(); }, 30000);
    window.addEventListener('online', visible); window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(interval); window.removeEventListener('online', visible); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [sync]);
  async function mutate(task: () => Promise<void>) {
    if (lock.current || uncertain) return;
    lock.current = true; setBusy(true); setMessage(''); setSyncNotice('');
    try { await task(); }
    catch (error) { setUncertain(true); setMessage(error instanceof Error ? error.message : 'Result unknown. Refresh status before retrying.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function acceptQuest(result: QuestResult) {
    setData(previous => previous ? { ...previous, quest: result } : previous);
    if (!result.ok) setMessage(resultMessages[result.code] ?? 'This action was not accepted. The saved state is shown.');
    if (result.session?.status === 'completed') { setCompletion({ quest: result.session, reward: result.reward_coins }); setView('completion'); }
    else if (result.session?.status === 'cancelled' || result.session?.status === 'expired') { setView('home'); setMessage(resultMessages[result.code] ?? 'Quest cancelled. No completion coins earned.'); }
    else if (activeQuest(result.session)) setView('timer');
  }
  async function start(input: QuestInput) {
    await mutate(async () => { const result = await rpc<QuestResult>(createClient(), 'start_study_quest', { p_topic: input.topic.trim(), p_subject: input.subject.trim() || null, p_study_mode: input.mode, p_finish_line: input.finishLine.trim(), p_planned_minutes: Number(input.minutes) }); acceptQuest(result); });
  }
  async function timerAction(action: 'pause' | 'resume' | 'cancel' | 'complete') {
    const id = data?.quest.session?.id; if (!id) return;
    setTimerPending({ pause: 'Pausing…', resume: 'Resuming…', cancel: 'Cancelling…', complete: 'Checking session completion…' }[action]);
    await mutate(async () => acceptQuest(await rpc<QuestResult>(createClient(), `${action}_study_quest`, { p_session_id: id })));
    setTimerPending('');
  }
  async function followup(target: 'reflection' | 'next_step', text: string | null) {
    if (!completion) return;
    await mutate(async () => {
      const result = await rpc<QuestResult>(createClient(), target === 'reflection' ? 'set_learning_check' : 'set_next_step', { p_session_id: completion.quest.id, p_action: text === null ? 'skip' : target === 'reflection' ? 'answer' : 'save', p_text: text });
      if (result.session?.status === 'completed') {
        setCompletion({ quest: result.session, reward: result.reward_coins });
        setData(previous => previous ? { ...previous, bookmark: result.session?.next_step_status === 'saved' ? result.session : previous.bookmark } : previous);
      }
      setMessage(result.ok ? text === null ? 'Choice saved: skipped.' : 'Response saved.' : resultMessages[result.code] ?? 'Response not saved. Refresh status and try again.');
    });
  }
  async function buy(item: CatalogItem) {
    await mutate(async () => {
      const result = await rpc<{ ok: boolean; code: string; coins_balance: number; owned: boolean; item_id: string }>(createClient(), 'purchase_shop_item', { p_item_id: item.id });
      const fresh = await loadSnapshot(createClient()); setData(fresh);
      setMessage(result.ok ? `${item.name} is owned. Open Room to Place it.` : resultMessages[result.code] ?? 'Purchase not accepted. Shop refreshed.');
    });
  }
  async function saveRoom(): Promise<boolean> {
    if (!data || !draft || lock.current || uncertain || conflict) return false;
    let saved = false;
    await mutate(async () => {
      const result = await saveRoomLayout(createClient(), draft, draftRevision, data.room);
      if (!result.ok) { setConflict(true); setMessage(resultMessages[result.code] ?? 'Room save rejected. Draft retained.'); return; }
      setData(previous => previous ? { ...previous, room: { ...result, room_save_contract: previous.room.room_save_contract } } : previous); setDraft(result.layout); setDraftRevision(result.room_revision); setMessage('Room saved.'); saved = true;
    }); return saved;
  }
  async function reloadRoom(confirmed = false) {
    if (dirty && !confirmed) { setRevertReady(true); return; }
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const fresh = await loadSnapshot(createClient()); const result = fresh.room; setData(fresh); setDraft(result.layout); setDraftRevision(result.room_revision); setConflict(false); setUncertain(false); setMessage('Saved room loaded.'); }
    catch { setMessage('Room could not be loaded. Draft retained.'); setUncertain(true); }
    finally { lock.current = false; setBusy(false); }
  }
  function go(next: View | 'signout') {
    if (busy) return;
    navigation.current.pending = null;
    if (dirty) { setLeaveTo(next); return; }
    finishGo(next);
  }
  function finishGo(next: View | 'signout') {
    // A clean editor snapshot is not a pending draft after leaving the editor.
    // Keeping it would misidentify a later remote room revision as a local edit.
    if (next !== 'editor') { setDraft(null); setConflict(false); }
    setLeaveTo(null); if (next === 'signout') setSignOutReady(true); else {
      const pending = navigation.current.pending;
      if (pending?.view === next) {
        navigation.current.pending = null;
        navigation.current.allowLeave = true;
        window.history.go(pending.delta);
      } else setView(next);
      setSignOutReady(false);
    } }
  function compose(from: Quest | null = null) { if (activeQuest(data?.quest.session)) go('timer'); else { setBookmark(from); go('compose'); } }
  const coins = data?.quest.coins_balance;
  const blocked = busy || uncertain;
  return <div className={`workspace view-${view}`}><header className="app-header"><a className="wordmark" href="/home" onClick={e => { e.preventDefault(); go('home'); }}>nookstep<span>✦</span></a><nav aria-label="Main navigation"><button aria-current={view === 'home' ? 'page' : undefined} disabled={busy} onClick={() => go('home')}>Home</button><button aria-current={view === 'shop' ? 'page' : undefined} disabled={busy} onClick={() => go('shop')}>Shop / Inventory</button></nav><span className="coin-pill" aria-label={`${coins === undefined ? "Unknown" : coins} coins${uncertain ? ", last loaded balance" : ""}`}><span aria-hidden="true">◈</span> {coins === undefined ? '—' : coins} coins{uncertain ? ' · last loaded' : ''}</span><AccountMenu email={email} active={activeQuest(data?.quest.session)} busy={busy} onTimer={() => go('timer')} onSignOut={() => go('signout')} onRefresh={() => void sync(true)} /></header>
    <main id="main-content" className="app-main">{view !== 'home' && view !== 'shop' && <button className="back" disabled={busy} onClick={() => go('home')}>← Back to My Room</button>}
      <div role="status" aria-live="polite">{syncNotice && <div className="status-toast"><span>{syncNotice}</span><button aria-label="Dismiss status" onClick={() => setSyncNotice('')}><span aria-hidden="true">×</span></button></div>}</div>
      {(busy || message || uncertain || conflict) && <div className={`sync-row ${uncertain ? 'sync-uncertain' : ''}`}><p role="status">{busy ? 'Contacting your study space…' : message || (uncertain ? 'Your saved progress needs to be checked.' : 'A newer saved room is available. Your draft is retained.')}</p>{(uncertain || conflict) && <button disabled={busy} onClick={() => void sync(true)}>{uncertain ? 'Retry / check status' : 'Refresh status'}</button>}</div>}
      {signOutReady && <ConfirmationDialog title="Sign out?" onCancel={() => setSignOutReady(false)}><p>{data?.quest.session?.status === 'running' ? 'Your Study Quest will continue running after you sign out unless you pause it first.' : data?.quest.session?.status === 'paused' ? 'Your Study Quest is paused. Signing out will not resume it.' : 'Your saved progress stays with your account.'}</p><div className="actions"><button data-dialog-default onClick={() => setSignOutReady(false)}>Stay signed in</button>{signOut}</div></ConfirmationDialog>}
      {revertReady && <ConfirmationDialog title="Revert to saved room?" onCancel={() => setRevertReady(false)}><p>Discard unsaved room changes and load the latest saved room. All purchased items remain yours.</p><div className="actions"><button data-dialog-default onClick={() => setRevertReady(false)}>Keep editing</button><button disabled={busy} onClick={() => { setRevertReady(false); void reloadRoom(true); }}>Revert changes</button></div></ConfirmationDialog>}
      {leaveTo && <ConfirmationDialog title="You have unsaved room changes." onCancel={() => setLeaveTo(null)}><p>Save before leaving, or discard this draft. Your owned items remain yours.</p><div className="actions"><button className="primary" disabled={blocked || conflict} onClick={async () => { if (await saveRoom()) finishGo(leaveTo); }}>Save & Leave</button><button disabled={busy} onClick={() => { setDraft(null); setConflict(false); finishGo(leaveTo); }}>Discard Changes</button><button data-dialog-default onClick={() => setLeaveTo(null)}>Stay</button></div></ConfirmationDialog>}
      {data?.quest.session?.status === 'expired' && <p className="notice" role="status">This quest expired after 24 hours. No coins were earned. You can start a new quest.</p>}
      {!data ? <section className="card"><h1>Your study space is temporarily unavailable.</h1><p>Reconnect and choose Retry / check status. Your saved data has not been reset.</p></section> : <>
        {activeQuest(data.quest.session) && view !== 'timer' && view !== 'home' && <div className="active-banner"><span>{data.quest.session!.status === 'paused' ? 'Paused' : 'Running'} · {data.quest.session!.topic}</span><button disabled={busy} onClick={() => go('timer')}>Return to Timer</button></div>}
        {view === 'home' && <><div className="welcome"><p className="eyebrow">YOUR SPACE. YOUR GOAL. YOUR NEXT STEP.</p><h1>Welcome to your little corner.</h1><p>Make room for what you want to learn.</p></div><div className="home-grid"><div className="home-study"><section className="card study-entry"><p className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</p><h2>{activeQuest(data.quest.session) ? 'Your quest is waiting.' : 'What will you work on today?'}</h2><p>{activeQuest(data.quest.session) ? data.quest.session!.finish_line : 'Choose a clear finish line and give yourself time to get there.'}</p><button className="primary" disabled={blocked} onClick={() => compose()}>{activeQuest(data.quest.session) ? data.quest.session!.status === 'paused' ? 'Return to Paused Timer' : 'Return to Timer' : 'Start Study Quest'}</button></section><section className="card bookmark"><p className="eyebrow">A NOTE TO YOUR FUTURE SELF</p><h2>Latest Next Step</h2>{data.bookmark ? <><small>{data.bookmark.topic} · {modes[data.bookmark.study_mode].label}</small><p className="user-text">{data.bookmark.next_step_text}</p><button disabled={blocked} onClick={() => compose(data.bookmark)}>{activeQuest(data.quest.session) ? 'Return to active quest first' : 'Continue from Next Step'}</button><small>Prepares a new, editable quest.</small></> : <p>After a session, leave yourself a small next action. It will be waiting here.</p>}</section>{completion && <button className="last-session" disabled={busy} onClick={() => go('completion')}>View last session</button>}</div><section className="card my-room"><div className="section-top"><div><p className="eyebrow">YOUR ROOM, AT YOUR PACE</p><h2>My Room</h2><small>Little steps in study. A space that grows with you.</small></div><button disabled={blocked} onClick={() => { setDraft(data.room.layout); setDraftRevision(data.room.room_revision); go('editor'); }}>Edit Room</button></div><RoomScene room={data.room.layout} />{!entityList(data.room.layout).length && <p>A fresh space for your next chapter. Earn coins through study to make it yours.</p>}</section></div></>}
        {view === 'compose' && <QuestForm key={bookmark?.id ?? 'new'} bookmark={bookmark} busy={busy} unavailable={uncertain} onStart={start} />}
        {view === 'timer' && (activeQuest(data.quest.session) ? <Timer result={data.quest} pendingLabel={timerPending} busy={busy} uncertain={uncertain} onAction={timerAction} onSync={sync} /> : <div className="card"><h1>No active quest.</h1><p>Your last session is no longer running. Its saved state has been synchronized.</p><button onClick={() => go(completion ? 'completion' : 'home')}>{completion ? 'View latest completion' : 'Back Home'}</button></div>)}
        {view === 'completion' && completion && <><Completion key={completion.quest.id} quest={completion.quest} reward={completion.reward} busy={blocked} onSave={followup} /><div className="actions"><button onClick={() => go('home')}>Back to My Room</button><button onClick={() => go('shop')}>Visit Shop</button></div></>}
        {view === 'shop' && <Shop catalog={data.catalog} owned={data.owned} placed={entityList(data.room.layout).map(i => i.id)} coins={data.quest.coins_balance} busy={blocked} onBuy={buy} onPlace={id => { setSelected(id); setDraft(data.room.layout); setDraftRevision(data.room.room_revision); go('editor'); }} />}
        {view === 'editor' && <RoomEditor naturalPlacement={canSaveRoomSurfaces(data.room)} room={draft ?? data.room.layout} catalog={data.catalog} owned={data.owned} initialSelected={selected} busy={busy} uncertain={uncertain} dirty={dirty} conflict={conflict} onChange={setDraft} onSave={() => void saveRoom()} onReload={() => void reloadRoom()} />}
      </>}
    </main><footer className="app-footer">Nookstep · Sirens & Knights </footer>
  </div>;
}
