import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mvpCatalog } from '../scripts/lib/mvp-catalog.mjs';
import { proposedRoomItems, roomQaCatalog, roomQaAssets } from '../scripts/lib/room-expansion-catalog.mjs';
import { roomCategories } from '../src/lib/room/categories.ts';
import { furniture, createItem, sprite } from '../src/lib/room/room.ts';
import { decorationDefinitions, createDecoration, decorationRendering } from '../src/lib/room/surfaces.ts';
import { wallKinds } from '../src/lib/room/walls.ts';
test('visual fixture adds six unique supported kinds without changing the seven approved products', () => {
  assert.deepEqual(roomQaCatalog.slice(0,7),mvpCatalog);
  assert.equal(new Set(roomQaCatalog.map(i=>i.id)).size,13);
  assert.equal(proposedRoomItems.length,6);
  assert.equal(roomQaAssets.length,39);
  assert.deepEqual(roomCategories.map(g=>g.label),['Furniture','Decorations','Wall Decorations']);
  for(const item of proposedRoomItems) {
    assert.ok(item.price_coins>=1 && item.price_coins<=25);
    assert.ok(!mvpCatalog.some(old=>old.id===item.id));
    if(item.surface_type==='floor') {
      assert.ok(furniture[item.room_kind]);
      for(const facing of ['frontLeft','frontRight','backLeft','backRight']) assert.equal(item.asset_variants[facing],sprite(item.room_kind,facing));
    } else if(item.surface_type==='tabletop') assert.ok(decorationDefinitions[item.room_kind]);
    else assert.ok(wallKinds.includes(item.room_kind));
  }
});
test('aquarium stays native 2×1 floor furniture and laptop uses the existing desk surface', () => {
  assert.equal(proposedRoomItems.find(i=>i.room_kind==='aquarium').surface_type,'floor');
  assert.deepEqual(furniture.aquarium,{width:2,depth:1,spriteWidth:108});
  assert.equal(proposedRoomItems.find(i=>i.room_kind==='laptop').surface_type,'tabletop');
  const parent=createItem('existing-desk','desk',{x:3,y:3});
  const laptop=createDecoration('qa-laptop','laptop',parent.id,{x:1,y:.5});
  assert.equal(laptop.parentId,'existing-desk');
  assert.equal(laptop.surfaceId,'desktop');
  assert.equal(decorationRendering(laptop,parent).href,'/assets/room/decorations/laptop/laptop-frontLeft.png');
});
