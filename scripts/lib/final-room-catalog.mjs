// Task 07D proposal. No production seed or authenticated application imports.
// All eight additions require separately approved database compatibility work.
import { roomQaCatalog } from './room-expansion-catalog.mjs';
const facings = ['frontLeft','frontRight','backLeft','backRight'];
export const finalRoomItems = [
  ...[['bookcase','Oak bookcase',12],['green-drawers','Green drawers',9],['sage-armchair','Sage armchair',10],['white-bedside','White bedside table',7],['wooden_table','Wooden table',11]].map(([kind,name,price],i)=>({
    id:`nook-${kind.replaceAll('_','-')}-01`,name,category:'Furniture',price_coins:price,sort_order:140+i*10,
    surface_type:'floor',room_kind:kind,asset_path:`/assets/room/normalized/${kind}/${kind}-frontLeft.png`,
    asset_variants:Object.fromEntries(facings.map(f=>[f,`/assets/room/normalized/${kind}/${kind}-${f}.png`])),is_active:true,
  })),
  ...[['clock-charcoal','Charcoal clock',4],['large-green-landscape','Green landscape',8]].map(([kind,name,price],i)=>({
    id:`nook-${kind}-01`,name,category:'Wall Decorations',price_coins:price,sort_order:190+i*10,surface_type:'wall',room_kind:kind,
    asset_path:`/assets/room/wall-decorations/${kind}/${kind}-left.png`,
    asset_variants:Object.fromEntries(['left','right'].map(side=>[side,`/assets/room/wall-decorations/${kind}/${kind}-${side}.png`])),is_active:true,
  })),
  {id:'nook-teddy-cream-01',name:'Cream teddy bear',category:'Decorations',price_coins:5,sort_order:210,surface_type:'tabletop',room_kind:'teddy-cream',
    asset_path:'/assets/room/decorations/teddy-cream/teddy-cream-frontLeft.png',asset_variants:Object.fromEntries(facings.map(f=>[f,`/assets/room/decorations/teddy-cream/teddy-cream-${f}.png`])),is_active:true},
];
export const finalRoomQaCatalog = [...roomQaCatalog,...finalRoomItems];
export const finalRoomAssets = [...new Set(finalRoomItems.flatMap(i=>[i.asset_path,...Object.values(i.asset_variants)]))].sort();
