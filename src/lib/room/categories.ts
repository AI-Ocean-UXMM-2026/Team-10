// Product grouping is independent of an item's authoritative placement surface.
export const decorationItemKinds = ['books','candle','laptop','coffeecups','teddy-cream','aquarium','lamp','television'] as const;
export function roomCategory(item: { room_kind: string; surface_type: string }) {
  return item.surface_type === 'wall' ? 'wall' : (decorationItemKinds as readonly string[]).includes(item.room_kind) ? 'decorations' : 'furniture';
}
export const roomCategories = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'decorations', label: 'Decorations' },
  { id: 'wall', label: 'Wall Decorations' },
] as const;
const presentationOrder = ['chair','desk','sofa','bed','bookcase','green-drawers','sage-armchair','white-bedside','wooden_table',...decorationItemKinds,'painting','window','clock-charcoal','large-green-landscape'];
export function roomItemOrder(a:{room_kind:string},b:{room_kind:string}) {
  const index=(kind:string)=>{const i=presentationOrder.indexOf(kind);return i<0?presentationOrder.length:i;};
  return index(a.room_kind)-index(b.room_kind);
}
