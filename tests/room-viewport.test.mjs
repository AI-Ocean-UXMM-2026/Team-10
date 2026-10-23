import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fittedScene, SCENE, clampZoom } from '../src/lib/room/viewport.ts'
for (const [width,height] of [[1060,710],[700,440],[368,316],[298,250]]) {
 test(`complete room fits ${width} × ${height}`,()=>{
  const fit=fittedScene(width,height,100)
  assert.ok(fit.width<=width+1e-8 && fit.height<=height+1e-8)
  assert.ok(Math.abs(fit.width/fit.height-SCENE.width/SCENE.height)<1e-8)
  assert.ok(SCENE.x<60 && SCENE.y < -50)
  assert.ok(SCENE.x+SCENE.width>700 && SCENE.y+SCENE.height>495)
  for(const zoom of [75,125,150,175,200]) {
   assert.ok(Math.abs(fittedScene(width,height,zoom).scale/fit.scale-zoom/100)<1e-8)
  }
 })
}
test('zoom bounds reject invalid values',()=>{
 assert.equal(clampZoom(0),75);assert.equal(clampZoom(250),200)
 assert.equal(clampZoom(NaN),100);assert.equal(clampZoom(Infinity),100)
})
