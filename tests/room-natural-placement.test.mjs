import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createItem,facings} from '../src/lib/room/room.ts';
import {createDecoration,decorationKinds,decorationDefinitions,decorationRendering,surfaceCompatibility,decorationError} from '../src/lib/room/surfaces.ts';
import {artwork,decorationTarget,floorTarget,grabAt,wallTarget} from '../src/lib/room/targets.ts';
import {createWallDecoration,wallRendering} from '../src/lib/room/walls.ts';
import {entityList,replaceEntity,layoutError} from '../src/lib/room/editing.ts';
import {normalizeRoom,rotateFurniture} from '../src/lib/room/roomState.ts';
import {roomCategory,roomCategories} from '../src/lib/room/categories.ts';
import {finalRoomQaCatalog} from '../scripts/lib/final-room-catalog.mjs';
const point=(box,grab={x:.5,y:.7})=>({x:box.x+box.width*grab.x,y:box.y+box.height*grab.y});
test('exactly three presentation groups contain 9/8/4 stable catalog identities',()=>{
 assert.deepEqual(roomCategories.map(g=>g.label),['Furniture','Decorations','Wall Decorations']);
 assert.deepEqual(roomCategories.map(g=>finalRoomQaCatalog.filter(i=>roomCategory(i)===g.id).length),[9,8,4]);
 assert.equal(new Set(finalRoomQaCatalog.map(i=>i.id)).size,21);
});
test('all eight decorations transfer to floor and every permitted tabletop in four parent facings',()=>{
 for(const parentKind of ['desk','wooden_table','white-bedside'])for(const facing of facings)for(const kind of decorationKinds){
  const parent=createItem('parent',parentKind,{x:2,y:2},facing),source=createItem('same-owned-id',kind,{x:0,y:0});
  let room={version:2,items:[parent,source],decorations:[],wallDecorations:[]};const old=structuredClone(room);
  const intended=createDecoration(source.id,kind,parent.id,{x:parentKind==='white-bedside'?.5:1,y:.5});
  intended.turn=decorationDefinitions[kind].directional?(4-facings.indexOf(facing))%4:0;
  const target=decorationTarget(room,source,point(decorationRendering(intended,parent)),{x:.5,y:.7});
  assert.equal(target.parentId,parent.id);assert.equal(target.error===null,surfaceCompatibility[parentKind].includes(kind),`${parentKind}/${facing}/${kind}`);
  if(target.error){assert.deepEqual(room,old);continue;}
  room=replaceEntity(room,target.entity);assert.equal(entityList(room).filter(i=>i.id===source.id).length,1);assert.equal(room.items.length,1);
  assert.deepEqual(normalizeRoom(room),room);assert.equal(layoutError(room),null);
  const desired=createItem(source.id,kind,{x:5,y:5}),floor=floorTarget(target.entity,room,point(artwork(desired,room)),{x:.5,y:.7});
  assert.equal(floor.x,5);assert.equal(floor.y,5);room=replaceEntity(room,floor);assert.equal(room.decorations.length,0);assert.equal(entityList(room).length,2);assert.equal(layoutError(room),null);
 }
});
test('direct reparenting, overlaps and parent rotation retain a single identity and stable local positions',()=>{
 const desk=createItem('desk','desk',{x:2,y:2}),table=createItem('table','wooden_table',{x:5,y:5});
 const child=createDecoration('child','teddy-cream',desk.id,{x:1,y:.5});let room={version:2,items:[desk,table],decorations:[child]};
 const intended={...child,parentId:table.id};const target=decorationTarget(room,child,point(decorationRendering(intended,table)),{x:.5,y:.7});assert.equal(target.error,null);assert.equal(target.parentId,table.id);
 room=replaceEntity(room,target.entity);assert.equal(room.decorations.length,1);assert.equal(entityList(room).length,3);
 const attached=structuredClone(room.decorations);for(let i=0;i<4;i++){const next=rotateFurniture(room,table.id);assert.equal(next.error,null);room=next.room;assert.deepEqual(room.decorations,attached);}
 assert.match(decorationError({...room.decorations[0],id:'occupied'},room.items,room.decorations),/overlaps/);
});
test('grab fractions survive zoom-independent projections, rotated fixed offsets and repeated floor drags',()=>{
 const source={...createItem('a','aquarium',{x:2,y:2}),facing:'frontRight'};const room={version:2,items:[source],decorations:[]};
 for(const grab of [{x:.2,y:.2},{x:.8,y:.9}]){
  const pointer=point(artwork(source,room),grab),actual=grabAt(source,room,pointer);assert.ok(Math.abs(actual.x-grab.x)<1e-8&&Math.abs(actual.y-grab.y)<1e-8);
  const result=floorTarget(source,room,{x:pointer.x+40,y:pointer.y+20},grab);
  assert.deepEqual(result,{...source,x:3});
 }
});
test('wall targets follow actual planes, preserve identity and use centre-seam hysteresis',()=>{
 const room={version:2,items:[],decorations:[],wallDecorations:[]};
 for(const kind of ['painting','window','clock-charcoal','large-green-landscape']){
  const source=createWallDecoration('owned',kind,'left',{x:4,y:5.6});
  for(const wall of ['right','left']){
   const desired={...source,wall};const target=wallTarget(room,source,point(wallRendering(desired)),{x:.5,y:.7});
   assert.equal(target.error,null);assert.equal(target.wall,wall);assert.equal(target.entity.id,source.id);assert.equal(target.entity.u,desired.u);assert.equal(target.entity.v,desired.v);
  }
  assert.equal(wallTarget(room,source,{x:382,y:0},{x:.5,y:.7},'left').wall,'left');
  assert.equal(wallTarget(room,source,{x:378,y:0},{x:.5,y:.7},'right').wall,'right');
  assert.ok(wallTarget(room,source,{x:380,y:490},{x:.5,y:.7}).error);
 }
});
