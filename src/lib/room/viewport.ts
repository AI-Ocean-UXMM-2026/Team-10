import type { Point } from './room'

// Includes the wall apex, floor outline and a small inspection margin.
export const SCENE = { x: 48, y: -62, width: 664, height: 570 }
export const MIN_ZOOM = 75
export const MAX_ZOOM = 200
export const ZOOM_STEP = 25
export function clampZoom(value: number) {
  return Number.isFinite(value) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) : 100
}
export function fittedScene(width: number, height: number, zoom: number) {
  const scale = Math.min(width / SCENE.width, height / SCENE.height) * clampZoom(zoom) / 100
  return { width: SCENE.width * scale, height: SCENE.height * scale, scale }
}
// Invert the actual SVG screen matrix, including fitting, zoom and scrolling.
export function screenToRoom(point: Point, matrix: DOMMatrix): Point {
  const result = new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse())
  return { x: result.x, y: result.y }
}
