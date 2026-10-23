import type { Point } from './room'
import { snapPosition } from './room'
import metadata from './wallSprites.json' with { type: 'json' }

export type WallId = 'left' | 'right'
export type WallKind = 'painting' | 'window' | 'clock-charcoal' | 'large-green-landscape'
// u travels from the centre corner outwards; v is height above the floor.
export type WallDecoration = { id: string; kind: WallKind; wall: WallId; u: number; v: number }
export const WALL_WIDTH = 8
export const WALL_HEIGHT = 11.25
export const WALL_SUBDIVISIONS = 20
export const wallIds: WallId[] = ['left', 'right']
export const wallKinds: WallKind[] = ['painting', 'window', 'clock-charcoal', 'large-green-landscape']
export const WALL_ASSETS = {
  painting: { left: '/assets/room/wall-decorations/painting/painting-left.png', right: '/assets/room/wall-decorations/painting/painting-right.png' },
  window: { left: '/assets/room/wall-decorations/window/window-left.png', right: '/assets/room/wall-decorations/window/window-right.png' },
  'clock-charcoal': { left: '/assets/room/wall-decorations/clock-charcoal/clock-charcoal-left.png', right: '/assets/room/wall-decorations/clock-charcoal/clock-charcoal-right.png' },
  'large-green-landscape': { left: '/assets/room/wall-decorations/large-green-landscape/large-green-landscape-left.png', right: '/assets/room/wall-decorations/large-green-landscape/large-green-landscape-right.png' },
}
export const wallDefinitions = { painting: { label: 'Painting', visibleWidth: 96 }, window: { label: 'Window', visibleWidth: 88 }, 'clock-charcoal': { label:'Clock', visibleWidth:24 }, 'large-green-landscape': { label:'Landscape', visibleWidth:80 } }
export function wallPoint(wall: WallId, point: Point): Point {
  return { x: 380 + (wall === 'left' ? -40 : 40) * point.x, y: 175 + 20 * point.x - 20 * point.y }
}
export function wallCoordinates(wall: WallId, point: Point): Point {
  const x = (point.x - 380) / (wall === 'left' ? -40 : 40)
  return { x, y: (175 + 20 * x - point.y) / 20 }
}
export function wallPolygon(wall: WallId, u = 0, v = 0, width = WALL_WIDTH, height = WALL_HEIGHT) {
  return [{x:u,y:v},{x:u+width,y:v},{x:u+width,y:v+height},{x:u,y:v+height}]
    .map(p=>wallPoint(wall,p)).map(p=>`${p.x},${p.y}`).join(' ')
}
export function snapWall(point: Point) { return snapPosition(point, WALL_SUBDIVISIONS) }
export function createWallDecoration(id: string, kind: WallKind, wall: WallId, position: Point): WallDecoration {
  const p = snapWall(position)
  return { id, kind, wall, u: p.x, v: p.y }
}
export function wallRendering(item: WallDecoration) {
  const meta = metadata[`${item.kind}-${item.wall}`]
  const scale = wallDefinitions[item.kind].visibleWidth / (meta.bounds[2] - meta.bounds[0])
  const contact = wallPoint(item.wall, { x: item.u, y: item.v })
  return { x: contact.x - meta.anchorX * scale, y: contact.y - meta.anchorY * scale,
    width: meta.width * scale, height: meta.height * scale, scale, href: WALL_ASSETS[item.kind][item.wall], meta }
}
export function wallBounds(item: WallDecoration) {
  const { meta, scale } = wallRendering(item), [u0,v0,u1,v1] = meta.localBounds
  return { left: item.u + u0 * scale, bottom: item.v + v0 * scale,
    right: item.u + u1 * scale, top: item.v + v1 * scale }
}
export function wallFootprint(item: WallDecoration) {
  const b = wallBounds(item)
  return wallPolygon(item.wall, b.left, b.bottom, b.right-b.left, b.top-b.bottom)
}
export function wallPlacementError(item: WallDecoration, others: WallDecoration[]): string | null {
  const b = wallBounds(item), epsilon = 1e-8
  if (![item.u,item.v].every(Number.isFinite) || b.left < -epsilon || b.right > WALL_WIDTH+epsilon || b.bottom < -epsilon || b.top > WALL_HEIGHT+epsilon)
    return 'Keep the whole decoration inside the wall edges, above the floor and below the ceiling.'
  if (others.some(other=>{
    if (other.id===item.id || other.wall!==item.wall) return false
    const a=wallBounds(other)
    return b.left<a.right-epsilon && b.right>a.left+epsilon && b.bottom<a.top-epsilon && b.top>a.bottom+epsilon
  })) return 'That wall decoration overlaps another decoration.'
  return null
}
export function wallDragPosition(start: WallDecoration, pointerStart: Point, pointerNow: Point): Point {
  const from=wallCoordinates(start.wall,pointerStart),to=wallCoordinates(start.wall,pointerNow)
  return { x:start.u+to.x-from.x, y:start.v+to.y-from.y }
}
export function transferWall(item: WallDecoration, wall: WallId, others: WallDecoration[]) {
  const candidate={...item,wall},error=wallPlacementError(candidate,others)
  return { item: error ? item : candidate, error }
}
export function normalizeWalls(value: unknown): WallDecoration[] {
  if (!Array.isArray(value)) return []
  const result: WallDecoration[]=[]
  for (const entry of value) {
    if (!entry || typeof entry!=='object') continue
    const d=entry as Record<string,unknown>
    if (typeof d.id!=='string' || result.some(other=>other.id===d.id) || !wallKinds.includes(d.kind as WallKind) || !wallIds.includes(d.wall as WallId)
      || typeof d.u!=='number' || typeof d.v!=='number' || !Number.isFinite(d.u) || !Number.isFinite(d.v)) continue
    result.push({id:d.id,kind:d.kind as WallKind,wall:d.wall as WallId,u:d.u,v:d.v})
  }
  return result
}
