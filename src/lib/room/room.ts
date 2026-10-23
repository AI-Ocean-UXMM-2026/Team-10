export type Kind = 'bed' | 'chair' | 'desk' | 'sofa' | 'lamp' | 'aquarium' | 'television' | 'bookcase' | 'green-drawers' | 'sage-armchair' | 'white-bedside' | 'wooden_table' | 'books' | 'candle' | 'laptop' | 'coffeecups' | 'teddy-cream'
export type Facing = 'frontLeft' | 'frontRight' | 'backLeft' | 'backRight'
export type Point = { x: number; y: number }
export type Footprint = { width: number; depth: number }
// x/y is the persistent placement reference. groundOffset is fixed when an item
// is added or loaded, so rotating cannot move its visible floor contact.
export type Item = Point & { id: string; kind: Kind; facing: Facing; groundOffset: Point }
export type FloorBounds = Point & Footprint
export const kinds: Kind[] = ['bed', 'chair', 'desk', 'sofa', 'lamp', 'aquarium', 'television', 'bookcase', 'green-drawers', 'sage-armchair', 'white-bedside', 'wooden_table', 'books', 'candle', 'laptop', 'coffeecups', 'teddy-cream']
// Preserve the existing rotation sequence and saved orientation names.
export const facings: Facing[] = ['frontLeft', 'frontRight', 'backLeft', 'backRight']
export const WIDTH = 8
export const DEPTH = 8
export const PLACEMENT_SUBDIVISIONS = 4
export const STORE = 'nookstep-room-lab-v1'
export const furniture: Record<Kind, Footprint & { spriteWidth: number }> = {
  bed: { width: 2, depth: 3, spriteWidth: 156 },
  chair: { width: 1, depth: 1, spriteWidth: 60 },
  desk: { width: 2, depth: 1, spriteWidth: 112 },
  sofa: { width: 2, depth: 1, spriteWidth: 112 },
  lamp: { width: 1, depth: 1, spriteWidth: 40 },
  aquarium: { width: 2, depth: 1, spriteWidth: 108 },
  television: { width: 2, depth: 1, spriteWidth: 100 },
  bookcase: { width: 1, depth: 1, spriteWidth: 64 },
  'green-drawers': { width: 1, depth: 1, spriteWidth: 64 },
  'sage-armchair': { width: 1, depth: 1, spriteWidth: 70 },
  'white-bedside': { width: 1, depth: 1, spriteWidth: 64 },
  wooden_table: { width: 2, depth: 1, spriteWidth: 108 },
  books: { width: .5, depth: .5, spriteWidth: 22 },
  candle: { width: .25, depth: .25, spriteWidth: 12 },
  laptop: { width: 1, depth: .75, spriteWidth: 36 },
  coffeecups: { width: .25, depth: .25, spriteWidth: 13 },
  'teddy-cream': { width: .5, depth: .5, spriteWidth: 20 },
}
export function sprite(kind: Kind, facing: Facing) {
  if (kind === 'laptop' || kind === 'teddy-cream') return `/assets/room/decorations/${kind}/${kind}-${facing}.png`
  if (kind === 'books' || kind === 'candle' || kind === 'coffeecups') return `/assets/room/decorations/${kind}-01.png`
  return `/assets/room/normalized/${kind}/${kind}-${facing}.png`
}
export function floorPoint(x: number, y: number): Point {
  return { x: 380 + (x - y) * 40, y: 175 + (x + y) * 20 }
}
export function floorCoordinates(point: Point): Point {
  return { x: ((point.x - 380) / 40 + (point.y - 175) / 20) / 2,
    y: ((point.y - 175) / 20 - (point.x - 380) / 40) / 2 }
}
export function footprint(item: Pick<Item, 'kind' | 'facing'>): Footprint {
  const { width, depth } = furniture[item.kind]
  return item.facing === 'frontRight' || item.facing === 'backRight'
    ? { width: depth, depth: width } : { width, depth }
}
export function diamond(x: number, y: number, width = 1, depth = 1) {
  return [floorPoint(x, y), floorPoint(x + width, y), floorPoint(x + width, y + depth), floorPoint(x, y + depth)]
    .map(p => `${p.x},${p.y}`).join(' ')
}
export function snapPosition(point: Point, subdivisions = PLACEMENT_SUBDIVISIONS): Point {
  return { x: Math.round(point.x * subdivisions) / subdivisions, y: Math.round(point.y * subdivisions) / subdivisions }
}
function onPlacementGrid(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value * PLACEMENT_SUBDIVISIONS)
}
export function createItem(id: string, kind: Kind, position: Point, facing: Facing = 'frontLeft'): Item {
  const { width, depth } = footprint({kind, facing})
  return { id, kind, ...position, facing, groundOffset: { x: width, y: depth } }
}
export function groundAnchor(item: Item): Point {
  return { x: item.x + item.groundOffset.x, y: item.y + item.groundOffset.y }
}
export function floorBounds(item: Item): FloorBounds {
  const f = footprint(item), anchor = groundAnchor(item)
  return { x: anchor.x - f.width, y: anchor.y - f.depth, ...f }
}
export function footprintPolygon(item: Item): string {
  const bounds = floorBounds(item)
  return diamond(bounds.x, bounds.y, bounds.width, bounds.depth)
}
export function overlaps(a: Item, b: Item) {
  const af = floorBounds(a), bf = floorBounds(b)
  return af.x < bf.x + bf.width && af.x + af.width > bf.x && af.y < bf.y + bf.depth && af.y + af.depth > bf.y
}
export function placementError(item: Item, items: Item[]): string | null {
  const b = floorBounds(item)
  if (!onPlacementGrid(item.x) || !onPlacementGrid(item.y) || b.x < 0 || b.y < 0 || b.x + b.width > WIDTH || b.y + b.depth > DEPTH) return 'The footprint must stay inside the room and on the placement grid.'
  if (items.some(other => other.id !== item.id && overlaps(item, other))) return 'That footprint overlaps other furniture.'
  return null
}
export function nextFacing(facing: Facing): Facing {
  return facings[(facings.indexOf(facing) + 1) % facings.length]
}
export function rotationProposal(item: Item, items: Item[]): { item: Item; error: string | null } {
  const candidate = { ...item, facing: nextFacing(item.facing) }
  const error = placementError(candidate, items)
  return { item: error ? item : candidate, error }
}
export function groundPoint(item: Item): Point {
  const anchor = groundAnchor(item)
  return floorPoint(anchor.x, anchor.y)
}
export function depthOrder(a: Item, b: Item) {
  const ap = groundPoint(a), bp = groundPoint(b)
  return ap.y - bp.y || ap.x - bp.x || a.id.localeCompare(b.id)
}
export function dragPosition(start: Item, pointerStart: Point, pointerNow: Point): Point {
  const from = floorCoordinates(pointerStart), to = floorCoordinates(pointerNow)
  return { x: start.x + (to.x - from.x), y: start.y + (to.y - from.y) }
}
// Old records have no groundOffset: derive it from their saved orientation.
// This preserves their numeric coordinates, footprint AND rendered ground contact.
// Normalization is in memory only; storage is written after a user edit.
export function normalizeStored(value: unknown): Item[] {
  if (!Array.isArray(value)) return []
  const items: Item[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const v = entry as Record<string, unknown>
    if (typeof v.id !== 'string' || !kinds.includes(v.kind as Kind) || !facings.includes(v.facing as Facing)
      || typeof v.x !== 'number' || typeof v.y !== 'number' || !onPlacementGrid(v.x) || !onPlacementGrid(v.y)) continue
    const kind = v.kind as Kind, facing = v.facing as Facing
    if (v.groundOffset === undefined) {
      // Keep legacy layouts, including their old overlapping/out-of-bounds footprints.
      if (v.x < 0 || v.x >= WIDTH || v.y < 0 || v.y >= DEPTH) continue
      items.push(createItem(v.id, kind, {x: v.x, y: v.y}, facing))
    } else if (v.groundOffset && typeof v.groundOffset === 'object') {
      const offset = v.groundOffset as Record<string, unknown>
      const f = footprint({kind, facing: 'frontLeft'})
      // Offsets can originate in either axis orientation, and never change afterward.
      if (!((offset.x === f.width && offset.y === f.depth) || (offset.x === f.depth && offset.y === f.width))) continue
      items.push({id: v.id, kind, facing, x: v.x, y: v.y, groundOffset: {x: Number(offset.x), y: Number(offset.y)}})
    }
  }
  return items
}
