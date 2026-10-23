import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomState } from '../room/roomState';
import { modes, type Quest, type QuestResult } from './model';
export type CatalogItem = { id: string; name: string; category: string; price_coins: number; surface_type: 'floor' | 'tabletop' | 'wall'; room_kind: string; asset_path: string; is_active: boolean };
export type RoomResult = { ok: boolean; code: string; room_revision: number; layout: RoomState; room_save_contract?: string };
export type Snapshot = { quest: QuestResult; room: RoomResult; catalog: CatalogItem[]; owned: string[]; bookmark: Quest | null; followup: Quest | null; followupReward: number };
export const resultMessages: Record<string, string> = {
  active_quest_exists: 'You already have an active quest. Return to its timer.', too_early: 'The server says there is still study time remaining. Timer synchronized.',
  expired: 'This quest expired after 24 hours. No coins were earned.', invalid_transition: 'This action is unavailable in the saved session state. Please synchronize.',
  not_found: 'This quest is unavailable for your account.', followup_already_set: 'A response was already recorded. The saved choice is shown.',
  item_unavailable: 'This item is no longer available to buy.', insufficient_coins: 'You do not have enough coins for this item.',
  room_update_required: 'This room needs an updated client. Your draft is retained; refresh the app before saving.',
  room_backend_required: 'Expanded room saving is unavailable. Your draft is retained until the backend is verified.',
  layout_conflict: 'A newer room was saved elsewhere. Your draft is retained. Load the saved room before editing again.',
};
export function decodeResult<T extends { ok: boolean; code: string }>(data: unknown): T {
  if (!data || typeof data !== 'object' || typeof (data as T).ok !== 'boolean' || typeof (data as T).code !== 'string') throw new Error('The service returned an unreadable result. Refresh status before retrying.');
  return data as T;
}
export async function rpc<T extends { ok: boolean; code: string }>(client: SupabaseClient, operation: string, args = {}) {
  const { data, error } = await client.rpc(operation, args).abortSignal(AbortSignal.timeout(15000));
  if (error && operation === 'save_room_layout_surfaces' && ['PGRST202', '42883'].includes(error.code)) throw new Error(resultMessages.room_backend_required);
  if (error) throw new Error('The request could not be confirmed. Refresh status to check the saved result before retrying.');
  const result = decodeResult<T>(data);
  const raw = result as unknown as Record<string, unknown>;
  const nonnegative = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (operation.includes('study_quest') || operation === 'get_my_active_quest' || operation === 'set_learning_check' || operation === 'set_next_step') {
    const quest = raw.session as Quest | null;
    if (!nonnegative(raw.coins_balance) || !nonnegative(raw.reward_coins) || typeof raw.server_time !== 'string' || !Number.isFinite(Date.parse(raw.server_time))
      || (raw.active_seconds !== null && !nonnegative(raw.active_seconds))
      || (quest !== null && (!quest || typeof quest.id !== 'string' || !Object.hasOwn(modes, quest.study_mode) || !['running','paused','completed','cancelled','expired'].includes(quest.status) || !nonnegative(quest.planned_minutes)))) {
      throw new Error('Session data could not be verified. Refresh status before retrying.');
    }
  } else if (operation === 'get_my_room_layout' || operation === 'save_room_layout' || operation === 'save_room_layout_surfaces') {
    const layout = raw.layout as RoomState;
    if (!nonnegative(raw.room_revision) || !layout || layout.version !== 2 || !Array.isArray(layout.items) || !Array.isArray(layout.decorations) || (layout.wallDecorations !== undefined && !Array.isArray(layout.wallDecorations))) throw new Error('Room data could not be verified. Your draft has been retained.');
  } else if (operation === 'purchase_shop_item' && (!nonnegative(raw.coins_balance) || typeof raw.owned !== 'boolean' || typeof raw.item_id !== 'string')) throw new Error('Purchase result could not be verified. Refresh status before retrying.');
  return result;
}
export async function loadSnapshot(client: SupabaseClient): Promise<Snapshot> {
  const signal = () => AbortSignal.timeout(15000);
  const [quest, room, catalog, inventory, bookmark, followup] = await Promise.all([
    rpc<QuestResult>(client, 'get_my_active_quest'), rpc<RoomResult>(client, 'get_my_room_layout'),
    client.from('shop_items').select('id,name,category,price_coins,surface_type,room_kind,asset_path,is_active').order('sort_order').abortSignal(signal()),
    client.from('user_inventory').select('item_id').abortSignal(signal()),
    client.from('study_sessions').select('*').eq('next_step_status', 'saved').not('next_step_text', 'is', null).order('ended_at', { ascending: false }).limit(1).abortSignal(signal()),
    client.from('study_sessions').select('*').eq('status', 'completed').order('ended_at', { ascending: false }).limit(1).abortSignal(signal()),
  ]);
  if (!quest.ok || !room.ok || [catalog, inventory, bookmark, followup].some(r => r.error)) throw new Error('Your saved progress could not be loaded. Retry when connected. No progress has been reset.');
  const latest = followup.data?.[0] as Quest | undefined;
  let reward = 0;
  if (latest) {
    const ledger = await client.from('coin_transactions').select('amount').eq('session_id', latest.id).eq('kind', 'session_reward').abortSignal(signal());
    if (ledger.error) throw new Error('Your completion reward could not be checked. Please retry.');
    reward = ledger.data?.[0]?.amount ?? 0;
  }
  return { quest, room, catalog: catalog.data ?? [], owned: (inventory.data ?? []).map(row => row.item_id), bookmark: bookmark.data?.[0] ?? null, followup: latest ?? null, followupReward: reward };
}

// Release opt-in and the server-advertised contract are both required. Keep false
// until isolated PostgreSQL AND authenticated staging verification are complete.
export const expandedRoomSavingEnabled = process.env.NEXT_PUBLIC_ROOM_SURFACES_VERIFIED === 'true';
export function canSaveRoomSurfaces(room: RoomResult, enabled = expandedRoomSavingEnabled) {
  return enabled && room.room_save_contract === 'surfaces-v1';
}
export function isLegacyRoom(layout: RoomState) {
  return layout.items.every(item => ['bed','chair','desk','sofa','lamp','aquarium','television'].includes(item.kind))
    && layout.decorations.every(child => ['books','candle','coffeecups','laptop'].includes(child.kind)
      && layout.items.some(parent => parent.id === child.parentId && parent.kind === 'desk'))
    && (layout.wallDecorations ?? []).every(item => ['painting','window'].includes(item.kind));
}
export async function saveRoomLayout(client: SupabaseClient, layout: RoomState, revision: number, saved: RoomResult, enabled = expandedRoomSavingEnabled) {
  const surfaces = canSaveRoomSurfaces(saved, enabled);
  // Inspect the loaded room too: an older reader/draft must never omit placements.
  if (!surfaces && (!isLegacyRoom(layout) || !isLegacyRoom(saved.layout))) {
    throw new Error(resultMessages.room_backend_required);
  }
  return rpc<RoomResult>(client, surfaces ? 'save_room_layout_surfaces' : 'save_room_layout', {
    p_layout: layout, p_expected_room_revision: revision,
  });
}
