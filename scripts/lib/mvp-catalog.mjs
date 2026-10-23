// Operator/test metadata only. Browser prices and ownership always come from Supabase.
const facings = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
const floor = (kind, name, category, price_coins, sort_order) => ({
  id: `nook-${kind}-01`, name, category, price_coins, sort_order,
  surface_type: 'floor', room_kind: kind,
  asset_path: `/assets/room/normalized/${kind}/${kind}-frontLeft.png`,
  asset_variants: Object.fromEntries(facings.map(facing => [facing, `/assets/room/normalized/${kind}/${kind}-${facing}.png`])),
  is_active: true,
});
export const mvpCatalog = [
  floor('chair', 'Study chair', 'Seating', 3, 10),
  floor('desk', 'Study desk', 'Desks', 10, 20),
  floor('lamp', 'Standing lamp', 'Lighting', 6, 30),
  floor('sofa', 'Cozy sofa', 'Seating', 15, 40),
  { id: 'nook-books-01', name: 'Little book stack', category: 'Tabletop', price_coins: 2, sort_order: 50, surface_type: 'tabletop', room_kind: 'books', asset_path: '/assets/room/decorations/books-01.png', asset_variants: {}, is_active: true },
  { id: 'nook-candle-01', name: 'Desk candle', category: 'Tabletop', price_coins: 2, sort_order: 60, surface_type: 'tabletop', room_kind: 'candle', asset_path: '/assets/room/decorations/candle-01.png', asset_variants: {}, is_active: true },
  { id: 'nook-painting-01', name: 'Framed painting', category: 'Wall art', price_coins: 5, sort_order: 70, surface_type: 'wall', room_kind: 'painting', asset_path: '/assets/room/wall-decorations/painting/painting-left.png', asset_variants: { left: '/assets/room/wall-decorations/painting/painting-left.png', right: '/assets/room/wall-decorations/painting/painting-right.png' }, is_active: true },
];
export const runtimeAssets = [...new Set(mvpCatalog.flatMap(item => [item.asset_path, ...Object.values(item.asset_variants)]))].sort();
