// PROPOSAL ONLY. Never imported by the authenticated app or production seed.
import { mvpCatalog } from './mvp-catalog.mjs';
const facings = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
export const proposedRoomItems = [
  ...[['bed', 'Single bed', 18], ['aquarium', 'Aquarium on stand', 15], ['television', 'Television stand', 12]].map(([kind, name, price], i) => ({
    id: `nook-${kind}-01`, name, category: kind === 'bed' ? 'Furniture' : 'Decorations', price_coins: price,
    sort_order: 80 + i * 10, surface_type: 'floor', room_kind: kind,
    asset_path: `/assets/room/normalized/${kind}/${kind}-frontLeft.png`,
    asset_variants: Object.fromEntries(facings.map(f => [f, `/assets/room/normalized/${kind}/${kind}-${f}.png`])), is_active: true,
  })),
  { id: 'nook-laptop-01', name: 'Study laptop', category: 'Decorations', price_coins: 8, sort_order: 110, surface_type: 'tabletop', room_kind: 'laptop', asset_path: '/assets/room/decorations/laptop/laptop-frontLeft.png', asset_variants: Object.fromEntries(facings.map(f => [f, `/assets/room/decorations/laptop/laptop-${f}.png`])), is_active: true },
  { id: 'nook-coffeecups-01', name: 'Coffee cup', category: 'Decorations', price_coins: 2, sort_order: 120, surface_type: 'tabletop', room_kind: 'coffeecups', asset_path: '/assets/room/decorations/coffeecups-01.png', asset_variants: {}, is_active: true },
  { id: 'nook-window-01', name: 'Room window', category: 'Wall Decorations', price_coins: 5, sort_order: 130, surface_type: 'wall', room_kind: 'window', asset_path: '/assets/room/wall-decorations/window/window-left.png', asset_variants: { left: '/assets/room/wall-decorations/window/window-left.png', right: '/assets/room/wall-decorations/window/window-right.png' }, is_active: true },
];
export const roomQaCatalog = [...mvpCatalog, ...proposedRoomItems];
export const roomQaAssets = [...new Set(roomQaCatalog.flatMap(i => [i.asset_path, ...Object.values(i.asset_variants)]))].sort();
