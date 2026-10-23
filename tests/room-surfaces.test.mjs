import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createItem, facings, floorPoint, normalizeStored } from '../src/lib/room/room.ts'
import { createDecoration, surfacePoint, surfaceCoordinates, decorationError, decorationDragPosition, decorationRendering, decorationFacing, decorationDepthOrder, floorCapabilities, decorationDefinitions } from '../src/lib/room/surfaces.ts'
import { normalizeRoom, rotateFurniture, removeFurniture } from '../src/lib/room/roomState.ts'
const desk = (facing='frontLeft') => createItem('desk','desk',{x:2,y:2},facing)
const child = (kind='laptop',x=.5,y=.5,id=kind) => createDecoration(id,kind,'desk',{x,y})
const room = (decorations=[]) => ({version:2,items:[desk()],decorations})
const close = (a,b) => { assert.ok(Math.abs(a.x-b.x)<1e-8); assert.ok(Math.abs(a.y-b.y)<1e-8) }
test('every calibrated surface projection has an inverse, independent of floor translation',()=> {
  for(const facing of facings) for(const p of [{x:.5,y:.5},{x:1.6,y:.25},{x:-.2,y:1.2}]) {
    const parent=desk(facing)
    close(surfaceCoordinates(parent,surfacePoint(parent,p)),p)
    const moved={...parent,x:3.25,y:2.75}
    const before=surfacePoint(parent,p),after=surfacePoint(moved,p),delta=floorPoint(1.25,.75),zero=floorPoint(0,0)
    close({x:after.x-before.x,y:after.y-before.y},{x:delta.x-zero.x,y:delta.y-zero.y})
  }
})
test('laptop, books and coffee cup share a desk without footprint collision',()=> {
  const decorations=[child(),child('books',1.15,.5),child('coffeecups',1.65,.5)]
  for(const facing of facings) for(const d of decorations) assert.equal(decorationError(d,[desk(facing)],decorations),null)
})
test('surface-only capabilities reject floors and standing lamp supports the reviewed local multi-surface model',()=> {
  assert.equal(floorCapabilities.lamp,'floorOrSurface')
  for(const definition of Object.values(decorationDefinitions)) assert.equal(definition.placement,'surface')
  assert.match(decorationError(child(),[createItem('desk','chair',{x:2,y:2})],[]),/cannot be placed on the floor/)
  assert.match(decorationError(child(),[],[]),/tabletop/)
})
test('surface movement preserves grab alignment, snaps finely, and rejects outside edges',()=> {
  const parent=desk(),start=child(),from=surfacePoint(parent,{x:.62,y:.46}),to=surfacePoint(parent,{x:.87,y:.51})
  close(decorationDragPosition(parent,start,from,from),{x:.5,y:.5})
  close(decorationDragPosition(parent,start,from,to),{x:.75,y:.55})
  assert.equal(decorationError({...start,u:.75,v:.55},[parent],[start]),null)
  for(const p of [{u:0,v:.5},{u:2,v:.5},{u:.5,v:0},{u:.5,v:1}]) assert.match(decorationError({...start,...p},[parent],[]),/inside/)
  assert.deepEqual(child('books',1.13,.53).u,1.15)
})
test('decorations cannot overlap; touching footprint edges and separate desks are allowed',()=> {
  const laptop=child(),books=child('books',.7,.5)
  assert.match(decorationError(books,[desk()],[laptop]),/overlaps/)
  assert.equal(decorationError(child('books',1.025,.5),[desk()],[laptop]),null)
  const other={...books,parentId:'other'}
  assert.equal(decorationError(other,[desk(),{...desk(),id:'other'}],[laptop]),null)
})
test('moving a desk carries all local attachments by the identical projected delta',()=> {
  const before=room([child(),child('books',1.15,.5)])
  const after={...before,items:[{...before.items[0],x:3.25,y:2.5}]}
  assert.equal(after.decorations,before.decorations)
  for(const d of before.decorations) {
    const a=decorationRendering(d,before.items[0]),b=decorationRendering(d,after.items[0])
    close({x:b.x-a.x,y:b.y-a.y},{x:30,y:35})
    assert.equal(a.width,b.width); assert.equal(a.height,b.height)
  }
})
test('parent rotation advances laptop PNGs and preserves static artwork, local state and sizes',()=> {
  let current=room([child(),child('books',1.15,.5),child('coffeecups',1.65,.5)])
  const original=structuredClone(current), attachments=current.decorations
  for(let i=0;i<4;i++) {
    const result=rotateFurniture(current,'desk');assert.equal(result.error,null);current=result.room
    assert.equal(current.decorations, attachments)
    assert.deepEqual(current.decorations,original.decorations)
    for(const d of current.decorations) {
      const view=decorationRendering(d,current.items[0])
      assert.equal(view.width,decorationDefinitions[d.kind].spriteWidth)
      if(d.kind==='laptop') assert.ok(view.href.endsWith(`laptop-${facings[(i+1)%4]}.png`))
      else assert.ok(view.href.endsWith(`${d.kind}-01.png`))
    }
  }
  assert.deepEqual(current,original)
  assert.equal(decorationFacing({...child(),turn:1},desk('frontRight')),'backLeft')
})
test('laptop rotation checks the changed local footprint rather than visual image bounds',()=> {
  const laptop=child('laptop',.5,.35)
  assert.equal(decorationError(laptop,[desk()],[laptop]),null)
  assert.match(decorationError({...laptop,turn:1},[desk()],[laptop]),/inside/)
})
test('desk rotations reject floor collisions or insufficient calibrated surface margins atomically',()=> {
  const narrow=room([child('coffeecups',.2,.2)])
  // frontLeft margin .08 permits this near-edge cup.
  assert.equal(decorationError(narrow.decorations[0],narrow.items,narrow.decorations),null)
  const edge=room([child('candle',.18,.5)]) // .09 clearance fits .08 but not .10.
  assert.equal(decorationError(edge.decorations[0],edge.items,edge.decorations),null)
  const snapshot=structuredClone(edge), result=rotateFurniture(edge,'desk')
  assert.match(result.error,/tabletop/);assert.equal(result.room,edge);assert.deepEqual(edge,snapshot)
  const blocked=room([child()]);blocked.items.push(createItem('chair','chair',{x:3,y:1}))
  assert.equal(rotateFurniture(blocked,'desk').room,blocked)
})
test('desk removal requires confirmation, cancel preserves everything, confirm cascades children only',()=> {
  const before=room([child(),child('books',1.15,.5)])
  before.items.push(createItem('chair','chair',{x:5,y:5}))
  const cancelled=removeFurniture(before,'desk')
  assert.equal(cancelled.needsConfirmation,true);assert.equal(cancelled.room,before)
  const confirmed=removeFurniture(before,'desk',true)
  assert.deepEqual(confirmed.room.decorations,[]);assert.deepEqual(confirmed.room.items,[before.items[1]])
  assert.equal(before.decorations.length,2)
})
test('versioned room persistence restores rotated attachments and migrates both older floor formats',()=> {
  const before=rotateFurniture(room([child(),child('books',1.15,.5)]),'desk').room
  assert.deepEqual(normalizeRoom(JSON.parse(JSON.stringify(before))),before)
  const legacy=[{id:'desk',kind:'desk',facing:'frontRight',x:2,y:2}]
  const raw=JSON.stringify(legacy)
  assert.deepEqual(normalizeRoom(legacy),{version:2,items:normalizeStored(legacy),decorations:[]})
  assert.equal(JSON.stringify(legacy),raw)
  assert.deepEqual(normalizeRoom([desk()]),{version:2,items:[desk()],decorations:[]})
  const corrupted={...before,decorations:[...before.decorations,{...child(),id:'orphan',parentId:'missing'},null,{...child(),id:'nan',u:NaN}]}
  assert.deepEqual(normalizeRoom(corrupted),before)
})
test('surface ordering follows projected contacts rather than sprite height',()=> {
  const a=child('books',.5,.4),b=child('candle',1.5,.6)
  for(const facing of facings) {
    const parent=desk(facing),ap=surfacePoint(parent,{x:a.u,y:a.v}),bp=surfacePoint(parent,{x:b.u,y:b.v})
    assert.equal(Math.sign(decorationDepthOrder(parent,a,b)),Math.sign(ap.y-bp.y))
  }
})
