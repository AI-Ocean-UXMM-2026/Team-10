import { furniture, groundPoint, sprite } from './room'
import type { Item, Point } from './room'
import sprites from './sprites.json' with { type: 'json' }
import renderAnchors from './renderAnchors.json' with { type: 'json' }
import decorations from './decorations.json' with { type: 'json' }

// Rendering only: saved facing/groundOffset and collision footprints stay intact.
// The sofa's two front PNGs were labelled along the opposite footprint axis.
export function renderFacing(item: Item) {
  return item.kind === 'sofa' && item.facing === 'frontLeft' ? 'frontRight'
    : item.kind === 'sofa' && item.facing === 'frontRight' ? 'frontLeft' : item.facing
}
export function floorSprite(item: Item) { return sprite(item.kind, renderFacing(item)) }
export function visualWidth(item: Item) { return item.kind === 'bed' ? 132 : item.kind === 'television' ? 72 : item.kind === 'lamp' ? 36 : furniture[item.kind].spriteWidth }
export function smallFloorMetadata(item: Item) {
  if (item.kind === 'laptop' || item.kind === 'teddy-cream') return decorations[`${item.kind}-${item.facing}`]
  if (item.kind === 'books' || item.kind === 'candle' || item.kind === 'coffeecups') return decorations[`${item.kind}-01`]
  return null
}
export function spriteScale(item: Item) { const small=smallFloorMetadata(item); return visualWidth(item) / (small ? small.bounds[2]-small.bounds[0] : sprites[`${item.kind}-${renderFacing(item)}` as keyof typeof sprites].width) }
export function spriteBox(item: Item) {
  const small=smallFloorMetadata(item)
  if (small) {
    const scale=spriteScale(item), ground=groundPoint(item), width=visualWidth(item), height=(small.bounds[3]-small.bounds[1])*scale
    return { x:ground.x-width/2, y:ground.y-height-width/4, width, height }
  }
  const meta = sprites[`${item.kind}-${renderFacing(item)}` as keyof typeof sprites]
  // Virtual front-corner anchors measured from the full alpha silhouette:
  // max(pixelY + abs(pixelX-anchorX)/2) keeps feet inside both front floor edges.
  const anchor = renderAnchors[`${item.kind}-${item.facing}` as keyof typeof renderAnchors]
  const scale = spriteScale(item)
  const ground = groundPoint(item)
  return { x: ground.x - anchor.anchorX * scale, y: ground.y - anchor.anchorY * scale, width: meta.width * scale, height: meta.height * scale }
}
export type ImageMetadata = { width: number; height: number; bounds: number[]; anchorX: number; anchorY: number }
export function decorationBox(meta: ImageMetadata, visibleWidth: number, contact: Point) {
  const [left, top, right, bottom] = meta.bounds
  const scale = visibleWidth / (right - left)
  return { x: contact.x - (meta.anchorX - left) * scale, y: contact.y - (meta.anchorY - top) * scale,
    width: visibleWidth, height: (bottom - top) * scale, viewBox: `${left} ${top} ${right-left} ${bottom-top}` }
}
