import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, kinds, facings, footprint, floorBounds, groundPoint } from '../src/lib/room/room.ts';
import { spriteBox, visualWidth, floorSprite } from '../src/lib/room/spriteGeometry.ts';
import { normalizeRoom } from '../src/lib/room/roomState.ts';
import { createDecoration, decorationRendering, decorationDefinitions } from '../src/lib/room/surfaces.ts';
test('render calibration preserves saved state and all logical floor dimensions',()=>{
  const expected={bed:[2,3],chair:[1,1],desk:[2,1],sofa:[2,1],lamp:[1,1],aquarium:[2,1],television:[2,1],bookcase:[1,1],'green-drawers':[1,1],'sage-armchair':[1,1],'white-bedside':[1,1],wooden_table:[2,1],books:[.5,.5],candle:[.25,.25],laptop:[1,.75],coffeecups:[.25,.25],'teddy-cream':[.5,.5]};
  for(const kind of kinds)for(const facing of facings){
    const item=createItem('saved-'+kind,kind,{x:2,y:2},facing),before=JSON.stringify(item);
    const [w,d]=expected[kind],turned=facing==='frontRight'||facing==='backRight';
    assert.deepEqual(footprint(item),{width:turned?d:w,depth:turned?w:d});
    const box=spriteBox(item);assert.ok(box.width>0&&box.height>0);assert.equal(JSON.stringify(item),before);
    assert.deepEqual(normalizeRoom({version:2,items:[item],decorations:[]}).items,[item]);
  }
});
test('all orientations fit the room side walls at valid logical corner positions',()=>{
  for(const kind of kinds)for(const facing of facings){
    const dimensions=footprint({kind,facing});
    for(const x of [0,8-dimensions.width])for(const y of [0,8-dimensions.depth]){
      const item=createItem('edge',kind,{x,y},facing),box=spriteBox(item);
      assert.ok(box.x>=60-1e-6,`${kind}/${facing} crosses left wall`);
      assert.ok(box.x+box.width<=700+1e-6,`${kind}/${facing} crosses right wall`);
      assert.deepEqual(floorBounds(item),{x,y,...dimensions});
      assert.ok(box.y+box.height<=groundPoint(item).y+1e-6);
    }
  }
});
test('scale corrections are selective and sofa front views match the footprint axis',()=>{
  for(const [kind,width] of [['bed',132],['television',72],['desk',112],['sofa',112],['chair',60],['lamp',36],['aquarium',108]]){
    assert.equal(visualWidth(createItem(kind,kind,{x:2,y:2})),width);
  }
  assert.equal(floorSprite(createItem('sofa','sofa',{x:2,y:2},'frontLeft')),'/assets/room/normalized/sofa/sofa-frontRight.png');
});
test('larger tabletop artwork stays attached without changing logical footprints or supported rotations',()=>{
  const parent=createItem('desk','desk',{x:2,y:2});
  for(const [kind,width,depth,directional] of [['laptop',.65,.45,true],['books',.4,.3,false],['coffeecups',.2,.2,false],['candle',.18,.18,false]]){
    const child=createDecoration(kind,kind,parent.id,{x:1,y:.5}),before=structuredClone(child);
    const a=decorationRendering(child,parent),b=decorationRendering(child,{...parent,x:3,y:2});
    assert.equal(decorationDefinitions[kind].width,width);assert.equal(decorationDefinitions[kind].depth,depth);assert.equal(decorationDefinitions[kind].directional,directional);
    assert.ok(Math.abs(b.x-a.x-40)<1e-8);assert.ok(Math.abs(b.y-a.y-20)<1e-8);assert.deepEqual(child,before);
  }
});
