import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createItem } from '../src/lib/room/room.ts'
import { createDecoration } from '../src/lib/room/surfaces.ts'
import { normalizeRoom, rotateFurniture, removeFurniture } from '../src/lib/room/roomState.ts'
import { wallIds, wallKinds, WALL_WIDTH, WALL_HEIGHT, wallPoint, wallCoordinates, wallPolygon, wallRendering, wallBounds, snapWall, createWallDecoration, wallPlacementError, wallDragPosition, transferWall, normalizeWalls } from '../src/lib/room/walls.ts'
const item=(kind='painting',wall='left',u=3,v=5.6,id='art')=>createWallDecoration(id,kind,wall,{x:u,y:v})
const close=(a,b)=>{assert.ok(Math.abs(a.x-b.x)<1e-8);assert.ok(Math.abs(a.y-b.y)<1e-8)}
for(const wall of wallIds) {
 test(`${wall} wall projection matches original vertices and round trips`,()=>{
  close(wallPoint(wall,{x:0,y:0}),{x:380,y:175})
  close(wallPoint(wall,{x:8,y:0}),{x:wall==='left'?60:700,y:335})
  close(wallPoint(wall,{x:0,y:11.25}),{x:380,y:-50})
  close(wallPoint(wall,{x:8,y:11.25}),{x:wall==='left'?60:700,y:110})
  for(const p of [{x:3.15,y:6.7},{x:-.2,y:12},{x:8,y:0}])close(wallCoordinates(wall,wallPoint(wall,p)),p)
  assert.equal(wallPolygon(wall).split(' ').length,4)
 })
 for(const kind of wallKinds) {
  test(`${kind} stays entirely inside ${wall} wall; every boundary rejects`,()=>{
   const d=item(kind,wall)
   assert.equal(wallPlacementError(d,[]),null)
   for(const position of [{u:0},{u:8},{v:0},{v:11.25},{u:NaN},{v:Infinity}])assert.match(wallPlacementError({...d,...position},[]),/inside/)
   const b=wallBounds(d),view=wallRendering(d)
   assert.ok(b.left>=0&&b.right<=WALL_WIDTH&&b.bottom>=0&&b.top<=WALL_HEIGHT)
   assert.ok(Math.abs(view.width/view.height-view.meta.width/view.meta.height)<1e-8)
   assert.ok(view.href.endsWith(`${kind}-${wall}.png`))
  })
 }
}
test('wall snapping is independent and precise along both axes',()=>{
 assert.deepEqual(snapWall({x:3.127,y:5.578}),{x:3.15,y:5.6})
 assert.deepEqual(snapWall({x:-.08,y:11.29}),{x:-.1,y:11.3})
})
test('off-centre grabs retain their offsets on both wall planes',()=>{
 for(const wall of wallIds) {
  const d=item('window',wall),from=wallPoint(wall,{x:3.2,y:5.75}),to=wallPoint(wall,{x:3.55,y:5.9})
  close(wallDragPosition(d,from,from),{x:d.u,y:d.v})
  close(wallDragPosition(d,from,to),{x:d.u+.35,y:d.v+.15})
 }
})
test('collisions reject overlap but permit adjacent occupied regions and other walls',()=>{
 for(const wall of wallIds) {
  const a=item('painting',wall,2,5.6,'a'),b=item('window',wall,2,5.6,'b')
  assert.match(wallPlacementError(b,[a]),/overlaps/)
  const ab=wallBounds(a),bb=wallBounds(b),adjacent={...b,u:b.u+ab.right-bb.left}
  assert.equal(wallPlacementError(adjacent,[a]),null)
  assert.match(wallPlacementError({...adjacent,u:adjacent.u-.05},[a]),/overlaps/)
  assert.equal(wallPlacementError({...b,wall:wall==='left'?'right':'left'},[a]),null)
 }
})
test('transfers preserve coordinates, switch assets and reject atomically',()=>{
 const a=item(),result=transferWall(a,'right',[])
 assert.equal(result.error,null);assert.equal(result.item.wall,'right')
 assert.equal(result.item.u,a.u);assert.equal(result.item.v,a.v)
 const blocker=item('window','right',3,5.6,'blocker')
 const refused=transferWall(a,'right',[a,blocker])
 assert.match(refused.error,/overlaps/);assert.equal(refused.item,a)
 const b=wallBounds(a),edge={...a,v:a.v-b.bottom+.001}
 assert.equal(wallPlacementError(edge,[]),null)
 // Each sprite has independently measured bounds; an edge may be invalid on transfer.
 const outside=transferWall({...a,u:0},'right',[])
 assert.ok(outside.error);assert.equal(outside.item.wall,'left')
})
test('old room schemas remain unchanged; wall data survives furniture edits and round trips',()=>{
 const desk=createItem('desk','desk',{x:2,y:2}),laptop=createDecoration('laptop','laptop','desk',{x:.7,y:.5})
 const old={version:2,items:[desk],decorations:[laptop]}
 assert.deepEqual(normalizeRoom(old),old)
 const current={...old,wallDecorations:[item(),item('window','right',5,5.6,'win')]}
 assert.deepEqual(normalizeRoom(JSON.parse(JSON.stringify(current))),current)
 assert.deepEqual(rotateFurniture(current,'desk').room.wallDecorations,current.wallDecorations)
 assert.deepEqual(removeFurniture(current,'desk',true).room.wallDecorations,current.wallDecorations)
 assert.deepEqual(normalizeRoom([desk]).items,[desk])
 const malformed=[...current.wallDecorations,null,{...item(),id:'bad',wall:'floor'},{...item(),id:'nan',u:NaN},item()]
 assert.deepEqual(normalizeWalls(malformed),current.wallDecorations)
})
const publicArt = new URL('../public/assets/room/', import.meta.url)
const localArt = new URL('../.local/room-art-review/room/', import.meta.url)
const artRoot = existsSync(publicArt) ? publicArt : localArt
test('source assets match measured checksums and remain unmodified', { skip: !existsSync(artRoot) && 'Artwork withheld pending publication-rights verification' },async(t)=>{
 const meta=JSON.parse(await readFile(new URL('../src/lib/room/wallSprites.json',import.meta.url)))
 for(const [key,value] of Object.entries(meta)) {
  const kind=key.split('-')[0],relative=`wall-decorations/${kind}/${key}.png`
  const asset=existsSync(new URL(relative,publicArt)) ? new URL(relative,publicArt) : new URL(relative,localArt)
  if (!existsSync(asset)) { t.diagnostic(`${key}: outside the curated MVP; no local review copy`); continue }
  const bytes=await readFile(asset)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),value.sha256)
 }
})
