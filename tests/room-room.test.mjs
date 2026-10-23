import { test } from 'node:test'
import assert from 'node:assert/strict'
import { floorPoint, floorCoordinates, footprint, placementError, kinds, facings, overlaps, depthOrder, dragPosition, normalizeStored, groundPoint, groundAnchor, floorBounds, createItem, snapPosition, PLACEMENT_SUBDIVISIONS, rotationProposal } from '../src/lib/room/room.ts'
const item = (props = {}) => {
  const { id = 'a', kind = 'chair', facing = 'frontLeft', x = 2, y = 2, ...rest } = props
  return { ...createItem(id, kind, { x, y }, facing), ...rest }
}
const close = (actual, expected) => {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `${actual.x} != ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `${actual.y} != ${expected.y}`)
}
test('isometric projection round trips across fractional and outside positions', () => {
  for (const x of [-3, 0, .25, 1.75, 7, 8, 12]) for (const y of [-4, 0, .75, 7, 8]) {
    close(floorCoordinates(floorPoint(x, y)), { x, y })
  }
})
test('quarter snapping uses one configurable subdivision factor without searching or clamping', () => {
  assert.equal(PLACEMENT_SUBDIVISIONS, 4)
  assert.deepEqual(snapPosition({ x: 1.13, y: 2.12 }), { x: 1.25, y: 2 })
  assert.deepEqual(snapPosition({ x: 1.37, y: 2.38 }), { x: 1.25, y: 2.5 })
  assert.deepEqual(snapPosition({ x: 1.125, y: 2.875 }), { x: 1.25, y: 3 })
  assert.deepEqual(snapPosition({ x: -.3, y: 8.26 }), { x: -.25, y: 8.25 })
  assert.deepEqual(snapPosition({ x: 1.13, y: 2.12 }, 8), { x: 1.125, y: 2.125 })
  for (const x of [-1, 0, .25, 1.5, 8]) assert.deepEqual(snapPosition({ x, y: x }), { x, y: x })
})
test('drag preserves an arbitrary grab offset from fractional positions, including after rotation', () => {
  const start = item({ kind: 'sofa', x: 2.25, y: 1.75 })
  const rotated = rotationProposal(start, [start]).item
  const from = { x: 319, y: 240 }
  for (const current of [start, rotated]) {
    close(dragPosition(current, from, from), { x: 2.25, y: 1.75 })
    close(dragPosition(current, from, { x: 329, y: 245 }), { x: 2.5, y: 1.75 })
    close(dragPosition(current, from, { x: 319, y: 250 }), { x: 2.5, y: 2 })
  }
})
test('all supported floor kinds cycle four orientations with identical logical and visible ground anchors', () => {
  assert.equal(kinds.length, 17)
  for (const kind of kinds) {
    let current = item({ kind, x: 2.25, y: 2.5 })
    const original = structuredClone(current), originalBounds = floorBounds(current), contact = groundPoint(current)
    for (let i = 0; i < 4; i++) {
      assert.equal(current.facing, facings[i])
      const proposal = rotationProposal(current, [current])
      assert.equal(proposal.error, null)
      current = proposal.item
      assert.equal(current.x, original.x); assert.equal(current.y, original.y)
      assert.deepEqual(current.groundOffset, original.groundOffset)
      assert.deepEqual(groundPoint(current), contact)
      const b = floorBounds(current), anchor = groundAnchor(current)
      assert.equal(b.x + b.width, anchor.x); assert.equal(b.y + b.depth, anchor.y)
    }
    assert.deepEqual(current, original)
    assert.deepEqual(floorBounds(current), originalBounds)
  }
})
test('oriented floor bounds pivot around the fixed contact', () => {
  const sofa = item({ kind: 'sofa', x: 2, y: 2 })
  assert.deepEqual(floorBounds(sofa), { x: 2, y: 2, width: 2, depth: 1 })
  const rotated = rotationProposal(sofa, [sofa]).item
  assert.deepEqual(floorBounds(rotated), { x: 3, y: 1, width: 1, depth: 2 })
  assert.deepEqual(groundPoint(rotated), floorPoint(4, 3))
})
test('full footprints at fractional positions obey every boundary', () => {
  for (const kind of kinds) for (const facing of facings) {
    const current = item({ kind, facing }), f = footprint(current)
    assert.equal(placementError({ ...current, x: 8 - f.width, y: 8 - f.depth }, []), null)
    assert.equal(placementError({ ...current, x: .25, y: .75 }, []), null)
    for (const p of [{ x: -.25, y: 0 }, { x: 0, y: -.25 }, { x: 8.25 - f.width, y: 0 }, { x: 0, y: 8.25 - f.depth }]) {
      assert.match(placementError({ ...current, ...p }, []), /inside/)
    }
    assert.match(placementError({ ...current, x: 1.1, y: 1 }, []), /placement grid/)
  }
})
test('fine-grid collisions allow adjacent footprints while rejecting quarter-tile overlap', () => {
  const desk = item({ kind: 'desk', x: 1.25, y: 1.5 })
  const adjacent = item({ id: 'b', x: 3.25, y: 1.75 })
  assert.equal(placementError(desk, [desk]), null)
  assert.equal(placementError(desk, [adjacent]), null)
  assert.equal(overlaps(desk, adjacent), false)
  const overlap = { ...adjacent, x: 3 }
  assert.equal(overlaps(desk, overlap), true)
  assert.match(placementError(overlap, [desk]), /overlaps/)
  // PNG height has no part in collision: a chair immediately behind the desk fits.
  assert.equal(placementError(item({ id: 'c', x: 1.25, y: .5 }), [desk]), null)
})
test('a blocked rotation returns the original item without teleporting or mutating it', () => {
  const sofa = item({ kind: 'sofa', x: 2.25, y: 2.25 })
  const obstacle = item({ id: 'b', x: 3.25, y: 1.25 })
  assert.equal(placementError(sofa, [obstacle]), null)
  const original = structuredClone(sofa)
  const result = rotationProposal(sofa, [sofa, obstacle])
  assert.match(result.error, /overlaps/)
  assert.equal(result.item, sofa)
  assert.deepEqual(sofa, original)
  const edge = item({ kind: 'sofa', x: 0, y: 0 })
  const blocked = rotationProposal(edge, [edge])
  assert.match(blocked.error, /inside/)
  assert.equal(blocked.item, edge)
})
test('rejected fine-grid destinations are not moved to nearby free positions', () => {
  const start = item({ x: 1.25, y: 2.5 }), obstacle = item({ id: 'b', x: 3, y: 2.5 })
  const position = snapPosition({ x: 2.8, y: 2.53 })
  assert.deepEqual(position, { x: 2.75, y: 2.5 })
  assert.match(placementError({ ...start, ...position }, [start, obstacle]), /overlaps/)
  assert.deepEqual(start, item({ x: 1.25, y: 2.5 }))
})
test('depth order uses the stable frontmost contact at fractional placements', () => {
  const back = item({ id: 'back', x: .25, y: .25 }), front = item({ id: 'front', x: 4.5, y: 4.5 })
  assert.ok(depthOrder(back, front) < 0)
  const bed = item({ kind: 'bed', x: 0, y: 0 }), chair = item({ x: 1, y: 1 })
  assert.ok(depthOrder(bed, chair) > 0)
  const rotated = rotationProposal(bed, []).item
  assert.equal(depthOrder(bed, chair), depthOrder(rotated, chair))
  assert.ok(depthOrder(item({ id: 'a' }), item({ id: 'b' })) < 0)
})
test('legacy normalization retains IDs, numeric positions, orientation, footprint and visual contact', () => {
  for (const kind of kinds) for (const facing of facings) {
    const old = { id: `${kind}-${facing}`, kind, facing, x: 7, y: 7 }
    const [loaded] = normalizeStored([old])
    const f = footprint(old)
    assert.deepEqual(loaded, { ...old, groundOffset: { x: f.width, y: f.depth } })
    assert.deepEqual(groundPoint(loaded), floorPoint(old.x + f.width, old.y + f.depth))
    assert.deepEqual(floorBounds(loaded), { x: old.x, y: old.y, ...f })
    assert.deepEqual(old, { id: `${kind}-${facing}`, kind, facing, x: 7, y: 7 })
  }
})
test('fractional rooms and rotated offsets survive repeated serialization and reload', () => {
  const sofa = item({ kind: 'sofa', x: 2.25, y: 1.75 })
  const rotated = rotationProposal(sofa, [sofa]).item
  const legacyOverlap = item({ id: 'legacy', kind: 'bed', x: 7, y: 7 })
  const values = [rotated, legacyOverlap]
  let current = values
  for (let i = 0; i < 3; i++) current = normalizeStored(JSON.parse(JSON.stringify(current)))
  assert.deepEqual(current, values)
  // A rotated item can legitimately have a negative reference while its physical bounds fit.
  const moved = { ...rotationProposal(item({ kind: 'bed', x: 2, y: 2 }), []).item, x: 1, y: -.75 }
  assert.equal(placementError(moved, []), null)
  assert.deepEqual(normalizeStored([moved]), [moved])
  assert.deepEqual(normalizeStored([null, {}, { ...sofa, kind: 'unknown' }, item({ x: NaN }), item({ x: .1 }), { ...sofa, groundOffset: { x: 900, y: 1 } }]), [])
  assert.deepEqual(normalizeStored({}), [])
})
