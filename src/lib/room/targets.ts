import { createItem, facings, floorCoordinates, groundPoint, snapPosition, type Item, type Point } from './room'
import { spriteBox } from './spriteGeometry'
import { createDecoration, decorationKinds, decorationDefinitions, decorationRendering, surfaceCoordinates, surfaceDefinition, surfacePoint, surfacePolygon, snapSurface, type DecorationKind } from './surfaces'
import { wallCoordinates, wallRendering, wallPolygon, wallPoint, snapWall, WALL_WIDTH, WALL_HEIGHT, type WallId } from './walls'
import { entityError, type Entity } from './editing'
import type { RoomState } from './roomState'

export type Grab = { x:number; y:number }
export type Target = { entity:Entity; error:string|null; parentId?:string; wall?:WallId; polygon?:string }
export function artwork(entity:Entity, room:RoomState) {
  return 'facing' in entity ? spriteBox(entity) : 'parentId' in entity
    ? decorationRendering(entity,room.items.find(i=>i.id===entity.parentId)!) : wallRendering(entity)
}
export function grabAt(entity:Entity, room:RoomState, point:Point):Grab {
  const box=artwork(entity,room)
  return { x:(point.x-box.x)/box.width, y:(point.y-box.y)/box.height }
}
function contactFor(pointer:Point, grab:Grab, view:{x:number;y:number;width:number;height:number}, contact:Point):Point {
  return { x:pointer.x-(view.x+view.width*grab.x-contact.x), y:pointer.y-(view.y+view.height*grab.y-contact.y) }
}
export function floorTarget(entity:Entity, room:RoomState, pointer:Point, grab:Grab):Item {
  const facing='facing' in entity ? entity.facing : 'parentId' in entity ? facings[(facings.indexOf(room.items.find(i=>i.id===entity.parentId)!.facing)+entity.turn)%4] : 'frontLeft'
  const sample='facing' in entity ? {...entity,x:0,y:0} : createItem(entity.id,entity.kind as Item['kind'],{x:0,y:0},facing)
  const contact=contactFor(pointer,grab,spriteBox(sample),groundPoint(sample)),anchor=floorCoordinates(contact)
  return {...sample,...snapPosition({x:anchor.x-sample.groundOffset.x,y:anchor.y-sample.groundOffset.y})}
}
// Project into actual affine planes, never DOM image bounds or event.target.
// The grab fraction stays fixed across source changes and depth reordering.
export function decorationTarget(room:RoomState, source:Entity, pointer:Point, grab:Grab, previousParent?:string):Target {
  const kind=source.kind as DecorationKind
  const facing='facing' in source ? source.facing : 'parentId' in source ? facings[(facings.indexOf(room.items.find(i=>i.id===source.parentId)!.facing)+source.turn)%4] : 'frontLeft'
  const candidates=room.items.filter(i=>i.id!==source.id&&surfaceDefinition(i)).map(parent=>{
    const def=surfaceDefinition(parent)!,turn=decorationDefinitions[kind].directional?(facings.indexOf(facing)-facings.indexOf(parent.facing)+4)%4:0
    const sample={...createDecoration(source.id,kind,parent.id,{x:0,y:0}),turn}
    const contact=contactFor(pointer,grab,decorationRendering(sample,parent),surfacePoint(parent,{x:0,y:0}))
    const local=surfaceCoordinates(parent,contact),raw=surfaceCoordinates(parent,pointer)
    const margin=parent.id===previousParent ? .08 : 0
    const inside=(p:Point)=>p.x>=-margin&&p.x<=def.width+margin&&p.y>=-margin&&p.y<=def.depth+margin
    return {parent,entity:{...sample,u:snapSurface(local).x,v:snapSurface(local).y},inside:inside(local)||inside(raw)}
  }).filter(c=>c.inside).sort((a,b)=>groundPoint(b.parent).y-groundPoint(a.parent).y||a.parent.id.localeCompare(b.parent.id))
  const chosen=candidates[0]
  if(chosen)return {entity:chosen.entity,error:entityError(chosen.entity,room),parentId:chosen.parent.id,polygon:surfacePolygon(chosen.parent)}
  const entity=floorTarget(source,room,pointer,grab)
  return {entity,error:entityError(entity,room)}
}
export function wallTarget(room:RoomState, source:Extract<Entity,{wall:WallId}>, pointer:Point, grab:Grab, previousWall:WallId=source.wall):Target {
  // Six scene units of hysteresis around the centre seam prevent rapid flipping.
  const wall:WallId=pointer.x<374?'left':pointer.x>386?'right':previousWall
  const sample={...source,wall,u:0,v:0},view=wallRendering(sample)
  const local=snapWall(wallCoordinates(wall,contactFor(pointer,grab,view,wallPoint(wall,{x:0,y:0}))))
  const raw=wallCoordinates(wall,pointer),entity={...source,wall,u:local.x,v:local.y}
  const onPlane=raw.x>=0&&raw.x<=WALL_WIDTH&&raw.y>=0&&raw.y<=WALL_HEIGHT
  return {entity,wall,polygon:wallPolygon(wall),error:onPlane?entityError(entity,room):'Place this item on a wall.'}
}
export function isDecoration(entity:Entity) { return decorationKinds.includes(entity.kind as DecorationKind) }
