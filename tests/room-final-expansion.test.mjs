import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createItem, facings, groundPoint} from '../src/lib/room/room.ts';
import {createDecoration, decorationError, decorationRendering, surfaceCompatibility, surfaceCoordinates, surfacePoint} from '../src/lib/room/surfaces.ts';
import {layoutError} from '../src/lib/room/editing.ts';
import {normalizeRoom, rotateFurniture, removeFurniture} from '../src/lib/room/roomState.ts';
import {createWallDecoration, wallPlacementError, wallRendering, transferWall} from '../src/lib/room/walls.ts';
import {finalRoomItems, finalRoomQaCatalog, finalRoomAssets} from '../scripts/lib/final-room-catalog.mjs';
import {roomQaCatalog} from '../scripts/lib/room-expansion-catalog.mjs';

test('eight final proposal records preserve the prior catalog and curate only 28 runtime files',async()=>{
 assert.deepEqual(finalRoomQaCatalog.slice(0,13),roomQaCatalog);
 assert.equal(finalRoomItems.length,8);assert.equal(finalRoomQaCatalog.length,21);
 assert.equal(new Set(finalRoomQaCatalog.map(i=>i.id)).size,21);assert.equal(finalRoomAssets.length,28);
 const manifest=JSON.parse(await readFile(new URL('../scripts/lib/final-room-assets.json',import.meta.url)));
 assert.deepEqual(manifest.map(m=>m.asset).sort(),finalRoomAssets);
 assert.ok(manifest.every(m=>m.width>0&&m.height>0&&m.source_sha256.length===64));
 for(const item of finalRoomItems){assert.ok(item.price_coins>0);assert.equal(Object.keys(item.asset_variants).length,item.surface_type==='wall'?2:4);}
});
test('surface compatibility is explicit; original TV/lamp retain floor catalog identities',()=>{
 for(const kind of ['desk','wooden_table','white-bedside']){
  const parent=createItem('parent',kind,{x:2,y:2});
  for(const childKind of ['laptop','books','coffeecups','candle','teddy-cream','television','lamp']){
   const child=createDecoration('child',childKind,parent.id,{x:kind==='white-bedside'?.5:1,y:.5});
   assert.equal(decorationError(child,[parent],[])===null,surfaceCompatibility[kind].includes(childKind),`${kind}/${childKind}`);
  }
 }
 for(const kind of ['lamp','television'])assert.equal(finalRoomQaCatalog.find(i=>i.room_kind===kind).surface_type,'floor');
});
test('all supported attachments preserve relative coordinates through movement and four rotations',()=>{
 for(const kind of ['desk','wooden_table','white-bedside'])for(const childKind of surfaceCompatibility[kind]){
  const parent=createItem('parent',kind,{x:2,y:2}),child=createDecoration('child',childKind,parent.id,{x:kind==='white-bedside'?.5:1,y:.5});
  let room={version:2,items:[parent],decorations:[child],wallDecorations:[]};
  const original=structuredClone(room),contact=groundPoint(parent);
  for(const facing of facings){
   assert.equal(layoutError(room),null);assert.equal(room.items[0].facing,facing);
   const position={x:child.u,y:child.v},point=surfacePoint(room.items[0],position),back=surfaceCoordinates(room.items[0],point);
   assert.ok(Math.abs(back.x-position.x)<1e-8&&Math.abs(back.y-position.y)<1e-8);
   const a=decorationRendering(child,room.items[0]),b=decorationRendering(child,{...room.items[0],x:3});
   assert.ok(Math.abs(b.x-a.x-40)<1e-8&&Math.abs(b.y-a.y-20)<1e-8);
   assert.deepEqual(groundPoint(room.items[0]),contact);
   const rotated=rotateFurniture(room,parent.id);assert.equal(rotated.error,null);room=rotated.room;
  }
  assert.deepEqual(room,original);assert.deepEqual(normalizeRoom(room),original);
  assert.equal(removeFurniture(room,parent.id).needsConfirmation,true);
  const removed=removeFurniture(room,parent.id,true).room;assert.equal(removed.items.length,0);assert.equal(removed.decorations.length,0);
 }
});
test('incompatible, oversized, overlapping and duplicate attachments are rejected without mutating state',()=>{
 const parent=createItem('bedside','white-bedside',{x:2,y:2}),child=createDecoration('teddy','teddy-cream',parent.id,{x:.5,y:.5});
 const room={version:2,items:[parent],decorations:[child]},snapshot=structuredClone(room);
 assert.match(decorationError({...child,id:'other'},[parent],[child]),/overlaps/);
 assert.match(decorationError({...child,u:.05},[parent],[child]),/edge/);
 assert.match(decorationError({...child,kind:'television'},[parent],[]),/compatible/);
 assert.match(layoutError({...room,decorations:[child,child]}),/once/);
 assert.deepEqual(room,snapshot);
});
test('new wall decorations use only paired facing artwork and enforce both wall envelopes',()=>{
 for(const kind of ['clock-charcoal','large-green-landscape'])for(const wall of ['left','right']){
  const item=createWallDecoration(kind,kind,wall,{x:4,y:5.6});assert.equal(wallPlacementError(item,[]),null);
  assert.match(wallRendering(item).href,new RegExp(`${kind}-${wall}.png$`));
  assert.equal(transferWall(item,wall==='left'?'right':'left',[]).error,null);
  assert.match(wallPlacementError({...item,u:0},[]),/edges/);
  assert.match(wallPlacementError({...item,id:'duplicate'},[item]),/overlaps/);
 }
});
