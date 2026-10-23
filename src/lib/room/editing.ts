import { placementError, type Item } from './room';
import { decorationError, type Decoration } from './surfaces';
import { wallPlacementError, type WallDecoration } from './walls';
import type { RoomState } from './roomState';
export type Entity = Item | Decoration | WallDecoration;
export function entityList(room: RoomState): Entity[] { return [...room.items, ...room.decorations, ...(room.wallDecorations ?? [])]; }
export function entityError(entity: Entity, room: RoomState) {
  if ('facing' in entity) return placementError(entity, room.items);
  if ('parentId' in entity) return decorationError(entity, room.items, room.decorations);
  return wallPlacementError(entity, room.wallDecorations ?? []);
}
export function replaceEntity(room: RoomState, entity: Entity): RoomState {
  // A surface transfer replaces one identity, never adds another owned instance.
  room = { ...room, items:room.items.filter(e => e.id !== entity.id || 'facing' in entity), decorations:room.decorations.filter(e => e.id !== entity.id || 'parentId' in entity), ...(room.wallDecorations ? {wallDecorations:room.wallDecorations.filter(e => e.id !== entity.id || 'wall' in entity)} : {}) };
  const update = <T extends Entity>(list: T[], value: T) => list.some(i => i.id === value.id) ? list.map(i => i.id === value.id ? value : i) : [...list, value];
  if ('facing' in entity) return { ...room, items: update(room.items, entity) };
  if ('parentId' in entity) return { ...room, decorations: update(room.decorations, entity) };
  return { ...room, wallDecorations: update(room.wallDecorations ?? [], entity) };
}
export function layoutError(room: RoomState) {
  const all = entityList(room);
  if (new Set(all.map(e => e.id)).size !== all.length) return 'Each item may only be placed once.';
  return all.map(e => entityError(e, room)).find(Boolean) ?? null;
}
