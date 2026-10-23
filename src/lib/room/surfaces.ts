import { facings, snapPosition, furniture } from './room'
import type { Facing, Item, Kind, Point } from './room'
import { spriteBox, spriteScale, decorationBox } from './spriteGeometry'
import metadata from './decorations.json' with { type: 'json' }
import sprites from './sprites.json' with { type: 'json' }

export type PlacementCapability = 'floor' | 'surface' | 'floorOrSurface'
export type DecorationKind = 'laptop' | 'books' | 'coffeecups' | 'candle' | 'teddy-cream' | 'aquarium' | 'lamp' | 'television'
export type Decoration = { id: string; kind: DecorationKind; parentId: string; surfaceId: 'desktop'; u: number; v: number; turn: number }
export const decorationKinds: DecorationKind[] = ['laptop', 'books', 'coffeecups', 'candle', 'teddy-cream', 'aquarium', 'lamp', 'television']
export const floorCapabilities = Object.fromEntries(Object.keys(furniture).map(kind=>[kind,decorationKinds.includes(kind as DecorationKind)?'floorOrSurface':'floor'])) as Record<Kind,PlacementCapability>
export const decorationDefinitions: Record<DecorationKind, { label: string; placement: PlacementCapability; width: number; depth: number; spriteWidth: number; directional: boolean }> = {
  laptop: { label:'Laptop', placement:'surface', width:.65, depth:.45, spriteWidth:36, directional:true },
  books: { label:'Books', placement:'surface', width:.4, depth:.3, spriteWidth:22, directional:false },
  coffeecups: { label:'Coffee cup', placement:'surface', width:.2, depth:.2, spriteWidth:13, directional:false },
  candle: { label:'Candle', placement:'surface', width:.18, depth:.18, spriteWidth:12, directional:false },
  'teddy-cream': { label:'Teddy bear', placement:'surface', width:.3, depth:.25, spriteWidth:20, directional:true },
  aquarium: { label:'Aquarium', placement:'surface', width:.6, depth:.4, spriteWidth:36, directional:true },
  lamp: { label:'Lamp', placement:'surface', width:.25, depth:.25, spriteWidth:14, directional:true },
  television: { label:'Television', placement:'surface', width:.7, depth:.4, spriteWidth:42, directional:true },
}
export const SURFACE_SUBDIVISIONS = 20
// Calibrated on the *visible* desk top in the normalized sprite, inside its rim.
// origin, uEnd and vEnd define an affine isometric plane, never a screen rectangle.
// Each orientation advances the local frame a quarter turn; children keep local u/v.
export type SurfaceDefinition = { id: 'desktop'; width: number; depth: number; margin: number; origin: Point; uEnd: Point; vEnd: Point }
// Fractions of tightly cropped sprite width. Each frame advances its local axes
// with the parent facing; attachments retain u/v. Native desk frames stay intact.
function measuredSurface(kind: Kind, facing: Facing, width: number, depth: number, points: number[]): SurfaceDefinition {
  const scale = sprites[`${kind}-${facing}` as keyof typeof sprites].width
  const point = (offset: number) => ({ x:points[offset]*scale, y:points[offset+1]*scale })
  return { id:'desktop', width, depth, margin:.12, origin:point(0), uEnd:point(2), vEnd:point(4) }
}
export const surfaces: Partial<Record<Kind, Record<Facing, SurfaceDefinition>>> = {
  desk: {
    frontLeft: { id:'desktop', width:2, depth:1, margin:.08, origin:{x:140,y:12}, uEnd:{x:484,y:157}, vEnd:{x:16,y:63} },
    frontRight: { id:'desktop', width:2, depth:1, margin:.12, origin:{x:485,y:64}, uEnd:{x:140,y:209}, vEnd:{x:354,y:12} },
    backLeft: { id:'desktop', width:2, depth:1, margin:.1, origin:{x:351,y:207}, uEnd:{x:16,y:64}, vEnd:{x:484,y:153} },
    backRight: { id:'desktop', width:2, depth:1, margin:.08, origin:{x:16,y:155}, uEnd:{x:354,y:12}, vEnd:{x:139,y:208} },
  },
  wooden_table: {
    frontLeft: measuredSurface('wooden_table','frontLeft',2,1,[.32,.02,.98,.27,.02,.15]),
    frontRight: measuredSurface('wooden_table','frontRight',2,1,[.98,.15,.34,.39,.68,.02]),
    backLeft: measuredSurface('wooden_table','backLeft',2,1,[.66,.41,.02,.16,.98,.27]),
    backRight: measuredSurface('wooden_table','backRight',2,1,[.02,.28,.65,.02,.35,.42]),
  },
  'white-bedside': {
    frontLeft: measuredSurface('white-bedside','frontLeft',1,1,[.50,.02,.97,.24,.025,.25]),
    frontRight: measuredSurface('white-bedside','frontRight',1,1,[.97,.24,.46,.52,.50,.02]),
    backLeft: measuredSurface('white-bedside','backLeft',1,1,[.56,.52,.03,.25,.97,.27]),
    backRight: measuredSurface('white-bedside','backRight',1,1,[.03,.29,.59,.02,.36,.55]),
  },
}
// Task 07E multi-surface matrix: local preview until the prepared DB review lands.
export const surfaceCompatibility: Partial<Record<Kind, readonly DecorationKind[]>> = {
  desk: decorationKinds.filter(kind=>kind!=='television'),
  wooden_table: decorationKinds,
  'white-bedside': decorationKinds.filter(kind=>kind!=='television'),
}
export function surfaceDefinition(parent: Item) { return surfaces[parent.kind]?.[parent.facing] }
export function surfaceFrame(parent: Item) {
  const def = surfaceDefinition(parent)
  if (!def) return null
  const box = spriteBox(parent)
  const scale = spriteScale(parent)
  return { def, origin: {x:box.x+def.origin.x*scale, y:box.y+def.origin.y*scale},
    u: {x:(def.uEnd.x-def.origin.x)*scale/def.width, y:(def.uEnd.y-def.origin.y)*scale/def.width},
    v: {x:(def.vEnd.x-def.origin.x)*scale/def.depth, y:(def.vEnd.y-def.origin.y)*scale/def.depth} }
}
export function surfacePoint(parent: Item, position: Point): Point {
  const frame = surfaceFrame(parent)
  if (!frame) throw new Error('This furniture has no surface.')
  return {x:frame.origin.x+frame.u.x*position.x+frame.v.x*position.y, y:frame.origin.y+frame.u.y*position.x+frame.v.y*position.y}
}
export function surfaceCoordinates(parent: Item, point: Point): Point {
  const frame = surfaceFrame(parent)
  if (!frame) throw new Error('This furniture has no surface.')
  const x = point.x-frame.origin.x, y = point.y-frame.origin.y
  const det = frame.u.x*frame.v.y-frame.u.y*frame.v.x
  return {x:(x*frame.v.y-y*frame.v.x)/det, y:(frame.u.x*y-frame.u.y*x)/det}
}
export function surfacePolygon(parent: Item, x = 0, y = 0, width?: number, depth?: number) {
  const def = surfaceDefinition(parent)
  if (!def) return ''
  const w=width??def.width, d=depth??def.depth
  return [{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}].map(point=>surfacePoint(parent,point)).map(p=>`${p.x},${p.y}`).join(' ')
}
export function snapSurface(position: Point) { return snapPosition(position, SURFACE_SUBDIVISIONS) }
export function decorationFootprint(decoration: Decoration) {
  const {width,depth} = decorationDefinitions[decoration.kind]
  return decoration.turn % 2 ? {width:depth,depth:width} : {width,depth}
}
export function decorationError(decoration: Decoration, items: Item[], attachments: Decoration[]): string | null {
  const parent = items.find(item=>item.id===decoration.parentId)
  const surface = parent && surfaceDefinition(parent)
  if (!surface || decoration.surfaceId!==surface.id) return 'Choose a supported tabletop. Decorations cannot be placed on the floor.'
  if (!surfaceCompatibility[parent.kind]?.includes(decoration.kind)) return 'This decoration is not compatible with that tabletop.'
  const f=decorationFootprint(decoration), epsilon=1e-8
  if (![decoration.u,decoration.v].every(Number.isFinite) || decoration.u-f.width/2 < surface.margin-epsilon || decoration.v-f.depth/2 < surface.margin-epsilon
    || decoration.u+f.width/2 > surface.width-surface.margin+epsilon || decoration.v+f.depth/2 > surface.depth-surface.margin+epsilon) return 'Keep the whole decoration inside the tabletop edge.'
  if (attachments.some(other=> {
    if (other.id===decoration.id || other.parentId!==decoration.parentId || other.surfaceId!==decoration.surfaceId) return false
    const of=decorationFootprint(other)
    return Math.abs(other.u-decoration.u) < (f.width+of.width)/2-epsilon && Math.abs(other.v-decoration.v) < (f.depth+of.depth)/2-epsilon
  })) return 'That decoration overlaps another decoration.'
  return null
}
export function decorationFacing(decoration: Decoration, parent: Item): Facing {
  return facings[(facings.indexOf(parent.facing)+decoration.turn)%facings.length]
}
export function decorationSprite(decoration: Pick<Decoration,'kind'|'turn'>, facing: Facing) {
  if (decoration.kind==='lamp' || decoration.kind==='aquarium' || decoration.kind==='television') return `/assets/room/normalized/${decoration.kind}/${decoration.kind}-${facing}.png`
  return decorationDefinitions[decoration.kind].directional ? `/assets/room/decorations/${decoration.kind}/${decoration.kind}-${facing}.png` : `/assets/room/decorations/${decoration.kind}-01.png`
}
export function decorationRendering(decoration: Decoration, parent: Item) {
  const facing = decorationFacing(decoration,parent)
  const width = decoration.kind==='aquarium' && parent.kind==='white-bedside' ? 26 : decoration.kind==='lamp' && parent.kind==='white-bedside' ? 12 : decorationDefinitions[decoration.kind].spriteWidth
  if (decoration.kind==='lamp' || decoration.kind==='aquarium' || decoration.kind==='television') {
    const source = sprites[`${decoration.kind}-${facing}`]
    const meta = { ...source, bounds:[0,0,source.width,source.height], anchorX:source.width/2, anchorY:source.height*.95 }
    return { ...decorationBox(meta,width,surfacePoint(parent,{x:decoration.u,y:decoration.v})),meta,href:decorationSprite(decoration,facing) }
  }
  const key = (decorationDefinitions[decoration.kind].directional ? `${decoration.kind}-${facing}` : `${decoration.kind}-01`) as keyof typeof metadata
  const meta = metadata[key]
  const contact = surfacePoint(parent,{x:decoration.u,y:decoration.v})
  return { ...decorationBox(meta, width, contact), meta, href:decorationSprite(decoration,facing) }
}
export function decorationPolygon(decoration: Decoration, parent: Item) {
  const f=decorationFootprint(decoration)
  return surfacePolygon(parent,decoration.u-f.width/2,decoration.v-f.depth/2,f.width,f.depth)
}
export function decorationDragPosition(parent: Item, start: Decoration, pointerStart: Point, pointerNow: Point) {
  const from=surfaceCoordinates(parent,pointerStart), to=surfaceCoordinates(parent,pointerNow)
  return {x:start.u+to.x-from.x,y:start.v+to.y-from.y}
}
// Children render within their parent's depth group, sorted by surface contact.
export function decorationDepthOrder(parent: Item, a: Decoration, b: Decoration) {
  const ap=surfacePoint(parent,{x:a.u,y:a.v}), bp=surfacePoint(parent,{x:b.u,y:b.v})
  return ap.y-bp.y || ap.x-bp.x || a.id.localeCompare(b.id)
}
export function createDecoration(id: string, kind: DecorationKind, parentId: string, point: Point): Decoration {
  const p=snapSurface(point)
  return {id,kind,parentId,surfaceId:'desktop',u:p.x,v:p.y,turn:0}
}
