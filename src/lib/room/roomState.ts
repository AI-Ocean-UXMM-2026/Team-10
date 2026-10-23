import { normalizeStored, rotationProposal } from './room'
import type { Item } from './room'
import { decorationKinds, decorationDefinitions, decorationError, surfaceDefinition } from './surfaces'
import type { Decoration } from './surfaces'
import { normalizeWalls } from './walls'
import type { WallDecoration } from './walls'
export type RoomState = { version: 2; items: Item[]; decorations: Decoration[]; wallDecorations?: WallDecoration[] }
export function normalizeRoom(value: unknown): RoomState {
  const data = value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : null
  const items = normalizeStored(Array.isArray(value) ? value : data?.version===2 ? data.items : [])
  const decorations: Decoration[] = []
  if (data?.version===2 && Array.isArray(data.decorations)) for (const entry of data.decorations) {
    if (!entry || typeof entry!=='object') continue
    const d=entry as Record<string,unknown>
    if (typeof d.id!=='string' || decorations.some(other=>other.id===d.id) || typeof d.parentId!=='string' || d.surfaceId!=='desktop' || !decorationKinds.includes(d.kind as Decoration['kind'])
      || typeof d.u!=='number' || typeof d.v!=='number' || !Number.isFinite(d.u) || !Number.isFinite(d.v) || !Number.isInteger(d.turn) || Number(d.turn)<0 || Number(d.turn)>3) continue
    if (!items.some(item=>item.id===d.parentId && surfaceDefinition(item))) continue
    const kind=d.kind as Decoration['kind']
    // Preserve structurally valid attachments, even if future geometry makes them need repositioning.
    decorations.push({id:d.id,kind,parentId:d.parentId,surfaceId:'desktop',u:d.u,v:d.v,turn:decorationDefinitions[kind].directional ? Number(d.turn) : 0})
  }
  return {version:2,items,decorations,...(data?.wallDecorations!==undefined ? {wallDecorations:normalizeWalls(data.wallDecorations)} : {})}
}
export function rotateFurniture(room: RoomState, id: string): { room: RoomState; error: string | null } {
  const parent=room.items.find(item=>item.id===id)
  if (!parent) return {room,error:'Select furniture first.'}
  const proposal=rotationProposal(parent,room.items)
  if (proposal.error) return {room,error:'Not enough space to rotate here.'}
  const items=room.items.map(item=>item.id===id ? proposal.item : item)
  const children=room.decorations.filter(child=>child.parentId===id)
  if (children.some(child=>decorationError(child,items,room.decorations))) return {room,error:'Not enough tabletop space to rotate with these decorations.'}
  return {room:{...room,items},error:null}
}
export function removeFurniture(room: RoomState, id: string, confirmed = false): { room: RoomState; needsConfirmation: boolean } {
  const hasChildren=room.decorations.some(child=>child.parentId===id)
  if (hasChildren && !confirmed) return {room,needsConfirmation:true}
  return {room:{...room,items:room.items.filter(item=>item.id!==id),decorations:room.decorations.filter(child=>child.parentId!==id)},needsConfirmation:false}
}
