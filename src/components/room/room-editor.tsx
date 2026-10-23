'use client';
import { useRef, useState } from 'react';
import type { CatalogItem } from '@/lib/study/data';
import { createItem, facings, floorPoint, kinds, type Kind, type Item } from '@/lib/room/room';
import { createDecoration, decorationKinds, decorationDefinitions, decorationError, decorationRendering, surfaceDefinition, surfacePoint, surfaceCompatibility, decorationFacing, type Decoration, type DecorationKind } from '@/lib/room/surfaces';
import { createWallDecoration, transferWall, wallKinds, wallPoint, type WallKind } from '@/lib/room/walls';
import { removeFurniture, rotateFurniture, type RoomState } from '@/lib/room/roomState';
import { entityList, entityError, layoutError, replaceEntity, type Entity } from '@/lib/room/editing';
import { RoomScene, type RoomSceneHandle } from './room-scene';
import { roomCategories, roomCategory, roomItemOrder } from '@/lib/room/categories';
import { ItemPreview } from './item-preview';
export function RoomEditor({ room, catalog, owned, initialSelected, busy, uncertain = false, dirty, conflict, onChange, onSave, onReload, naturalPlacement = false }: { room: RoomState; catalog: CatalogItem[]; owned: string[]; initialSelected?: string; naturalPlacement?:boolean; busy: boolean; uncertain?: boolean; dirty: boolean; conflict: boolean; onChange: (room: RoomState) => void; onSave: () => void; onReload: () => void }) {
  const [selected, setSelected] = useState(initialSelected ?? '');
  const [notice, setNotice] = useState('Select an owned item to place, move, rotate, or return it to inventory.');
  const dragRef=useRef<RoomSceneHandle>(null);
  const entity = entityList(room).find(i => i.id === selected);
  const item = catalog.find(i => i.id === selected);
  const disabled = busy || conflict || uncertain;
  const tabletopParent = room.items.find(i => surfaceDefinition(i))?.id ?? '';
  const availableParents = item && decorationKinds.includes(item.room_kind as DecorationKind) ? room.items.filter(i=>surfaceCompatibility[i.kind]?.includes(item.room_kind as DecorationKind) && (naturalPlacement || (i.kind==='desk' && item.surface_type==='tabletop'))) : [];
  function commit(next: Entity) { if(!owned.includes(next.id)){setNotice('This item is not owned.');return;} const error = entityError(next, room); if (error) { setNotice(`${error} Previous position kept.`); return; } onChange(replaceEntity(room, next)); setNotice('Item moved.'); }
  function place(entry: CatalogItem, destination?:Item|'floor', transferring=false) {
    setSelected(entry.id);
    if (!transferring && entityList(room).some(i => i.id === entry.id)) return;
    let candidate: Entity | undefined;
    if ((destination==='floor' || (!destination && (entry.surface_type === 'floor' || (naturalPlacement && decorationKinds.includes(entry.room_kind as DecorationKind))))) && kinds.includes(entry.room_kind as Kind)) {
      for (let y = 0; y <= 7 && !candidate; y += .25) for (let x = 0; x <= 7 && !candidate; x += .25) { const facing = transferring && entity && 'facing' in entity ? entity.facing : transferring && entity && 'parentId' in entity ? decorationFacing(entity,room.items.find(i=>i.id===entity.parentId)!) : 'frontLeft'; const value = createItem(entry.id, entry.room_kind as Kind, { x, y }, facing); if (!entityError(value, room)) candidate = value; }
    } else if ((destination || entry.surface_type === 'tabletop') && decorationKinds.includes(entry.room_kind as DecorationKind)) {
      const parentId = destination && destination!=='floor' ? destination.id : tabletopParent;
      if (!parentId) { setNotice('Place an owned desk first, then place this decoration.'); return; }
      const parent = room.items.find(i => i.id === parentId)!;
      const surface = surfaceDefinition(parent)!;
      let fallback: Decoration | undefined;
      for (let u = .15; u < surface.width - .1 && !candidate; u += .05) for (let v = .15; v < surface.depth - .1 && !candidate; v += .05) {
        const value = createDecoration(entry.id, entry.room_kind as DecorationKind, parentId, { x: u, y: v });
        if (entityError(value, room)) continue;
        fallback ??= value;
        const box = decorationRendering(value, parent);
        // Initial placement prefers visible artwork rather than hiding a tiny
        // cup/candle behind the laptop. This is not a new collision/save rule.
        const obscured = room.decorations.filter(d => d.parentId === parentId).some(d => {
          const other = decorationRendering(d, parent);
          return box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y;
        });
        const turns = decorationDefinitions[value.kind].directional ? [0,1,2,3] : [0];
        const rotatable = facings.every(facing => turns.every(turn => !decorationError({ ...value, turn }, room.items.map(i => i.id === parentId ? { ...i, facing } : i), room.decorations)));
        if (!obscured && rotatable) candidate = value;
      }
      candidate ??= fallback;
    } else if (entry.surface_type === 'wall' && wallKinds.includes(entry.room_kind as WallKind)) {
      const preferred = createWallDecoration(entry.id, entry.room_kind as WallKind, 'left', { x: 4, y: 5.6 });
      if (!entityError(preferred, room)) candidate = preferred;
      // Keep the familiar first placement, then find free space on this wall.
      for (let v = .25; v <= 11 && !candidate; v += .25) for (let u = .25; u <= 8 && !candidate; u += .25) {
        const value = createWallDecoration(entry.id, entry.room_kind as WallKind, 'left', { x: u, y: v });
        if (!entityError(value, room)) candidate = value;
      }
    }
    if (candidate) commit(candidate); else setNotice('No compatible space or asset is available. Move another item first.');
  }
  function move(axis: 'x' | 'y', direction: number) {
    if (!entity) return;
    if ('facing' in entity) commit({ ...entity, [axis]: entity[axis] + direction * .25 });
    else { const key = axis === 'x' ? 'u' : 'v'; commit({ ...entity, [key]: Math.round((entity[key] + direction * .05) * 20) / 20 }); }
  }
  function rotate() {
    if (!entity) return;
    if ('facing' in entity) { const proposal = rotateFurniture(room, entity.id); if (proposal.error) setNotice(proposal.error); else { onChange(proposal.room); setNotice('Item rotated.'); } }
    else if ('parentId' in entity && decorationDefinitions[entity.kind].directional) commit({ ...entity, turn: (entity.turn + 1) % 4 });
  }
  function remove() {
    if (!entity) return;
    if ('facing' in entity) { let proposal = removeFurniture(room, entity.id); if (proposal.needsConfirmation) { if (!window.confirm('Return this furniture and its attached decorations to inventory? All items remain owned.')) return; proposal = removeFurniture(room, entity.id, true); } onChange(proposal.room); }
    else onChange({ ...room, decorations: room.decorations.filter(i => i.id !== entity.id), wallDecorations: (room.wallDecorations ?? []).filter(i => i.id !== entity.id) });
    setNotice('Returned to inventory. Your item is still owned.');
  }
  // Derive arrow directions from the existing projection for each surface. The
  // movement handler and its floor/tabletop/wall increments remain unchanged.
  const parent = entity && 'parentId' in entity ? room.items.find(i => i.id === entity.parentId) : undefined;
  const movements = entity ? (['x', 'y'] as const).flatMap(axis => [-1, 1].map(direction => {
    const project = (point: { x: number; y: number }) => 'facing' in entity ? floorPoint(point.x, point.y)
      : 'wall' in entity ? wallPoint(entity.wall, point) : parent ? surfacePoint(parent, point) : point;
    const a = project({ x: 0, y: 0 }), b = project({ x: axis === 'x' ? direction : 0, y: axis === 'y' ? direction : 0 });
    const horizontal = Math.abs(b.x - a.x) < .001 ? '' : b.x > a.x ? 'right' : 'left';
    const vertical = Math.abs(b.y - a.y) < .001 ? '' : b.y > a.y ? 'down' : 'up';
    const name = [vertical, horizontal].filter(Boolean).join('-');
    const arrows: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→', 'up-left': '↖', 'up-right': '↗', 'down-left': '↙', 'down-right': '↘' };
    return { axis, direction, name, arrow: arrows[name], row: vertical === 'up' ? 1 : vertical === 'down' ? 3 : 2, column: horizontal === 'left' ? 1 : horizontal === 'right' ? 3 : 2 };
  })) : [];
  return <section className="card room-editor"><div className="section-top"><div><p className="eyebrow">MAKE IT YOURS</p><h1>Edit your room</h1></div></div>
    <p className="editor-intro">{naturalPlacement ? 'Choose an item, then drag it onto the floor, furniture or a wall to see where it fits.' : 'Choose an owned item, then drag it or use the movement pad. Save when it feels right.'}</p>
    <div className="room-workspace"><div className="room-main"><RoomScene room={room} editable selected={selected} disabled={disabled} naturalPlacement={naturalPlacement} labels={Object.fromEntries(catalog.map(i=>[i.id,i.name]))} dragRef={dragRef} onSelect={setSelected} onMove={commit} onNotice={setNotice} />
      <section className="room-changes" aria-label="Room changes"><div className="room-save-status"><strong>Room changes</strong><span className={`badge ${dirty ? 'unsaved' : ''}`} role="status">{busy ? 'Saving / synchronizing…' : uncertain ? 'Save status unknown' : conflict ? 'Newer saved room available' : dirty ? 'Unsaved changes' : 'Saved'}</span></div><div className="actions"><button className="primary" disabled={disabled || !dirty} onClick={() => { const error = layoutError(room); if (error) setNotice(error); else onSave(); }}>Save room</button><button disabled={busy} onClick={onReload}>{dirty ? 'Revert to saved room' : 'Refresh saved room'}</button></div>{(uncertain || conflict) && <p role="status">{uncertain ? 'Use Retry / check status to check the saved result before retrying. Your draft is retained.' : 'Your draft is retained. Revert to load the newer saved room.'}</p>}</section>
    </div><section className="editor-dock" aria-label="Selected item"><h2>{item?.name ?? 'Select an item'}</h2>{!item && <p className="selection-hint">Choose from My Items or select an item in the room.</p>}{item && !entity && <button disabled={disabled} onClick={() => place(item)}>Place selected item</button>}{entity && <><p className="placement-description">{'facing' in entity ? 'Floor item' : 'wall' in entity ? `${entity.wall === 'left' ? 'Left' : 'Right'} wall` : `On ${catalog.find(i => i.id === entity.parentId)?.name ?? 'furniture'}`}</p><div className="item-controls"><div className="movement-pad" role="group" aria-label="Move selected item">{movements.map(control => <button key={`${control.axis}${control.direction}`} className="move-button" style={{ gridRow: control.row, gridColumn: control.column }} disabled={disabled} aria-label={`Move ${control.name}`} title={`Move ${control.name}`} onClick={() => move(control.axis, control.direction)}><span aria-hidden="true">{control.arrow}</span></button>)}<span className="pad-center" aria-hidden="true">·</span></div><div className="item-actions">{('facing' in entity || ('parentId' in entity && decorationDefinitions[entity.kind].directional)) && <button disabled={disabled} onClick={rotate}>Rotate 90°</button>}{'wall' in entity && <button disabled={disabled} onClick={() => { const result = transferWall(entity, entity.wall === 'left' ? 'right' : 'left', room.wallDecorations ?? []); if (result.error) setNotice(result.error); else commit(result.item); }}>Move to other wall</button>}<button disabled={disabled} onClick={remove}>Return to inventory</button></div></div></>}
      {item && (entity || naturalPlacement) && decorationKinds.includes(item.room_kind as DecorationKind) && <div className="actions" aria-label="Placement alternatives">{naturalPlacement && entity && 'parentId' in entity && <button disabled={disabled} onClick={()=>place(item,'floor',true)}>Place on floor</button>}{availableParents.filter(parent=>!entity || !('parentId' in entity) || parent.id!==entity.parentId).map(parent=><button key={parent.id} disabled={disabled} onClick={()=>place(item,parent,true)}>Place on {catalog.find(c=>c.id===parent.id)?.name ?? parent.kind}</button>)}</div>}
      <p role="status" className="item-feedback">{notice}</p>
    </section>
    <details className="inventory" open><summary>My Items · {owned.length} owned</summary>
      {!owned.length && <p>Your inventory is empty. Earn coins through study, then buy an available item in the shop.</p>}<div>{roomCategories.map(group => { const entries = catalog.filter(c => owned.includes(c.id) && roomCategory(c) === group.id).sort(roomItemOrder); return entries.length ? <section className="inventory-category" key={group.id}><h3>{group.label}</h3><div className="item-list">{entries.map(entry => <button key={entry.id} disabled={disabled} aria-pressed={selected === entry.id} data-natural-drag={naturalPlacement || undefined} onPointerDown={e=>{
        // Touch users can scroll the inventory and tap to add, then drag in the
        // scene. Mouse/pen can drag directly from inventory into the room.
        if(!naturalPlacement || disabled || e.pointerType==='touch')return;
        const existing=entityList(room).find(i=>i.id===entry.id);
        const source=existing ?? (wallKinds.includes(entry.room_kind as WallKind) ? createWallDecoration(entry.id,entry.room_kind as WallKind,'left',{x:4,y:5.6}) : createItem(entry.id,entry.room_kind as Kind,{x:0,y:0}));
        dragRef.current?.beginInventory(e,source,()=>place(entry));
      }} onClick={() => place(entry)}><ItemPreview item={entry} decorative /><span><strong>{entry.name}</strong><small>{entityList(room).some(i => i.id === entry.id) ? 'Owned · placed · select' : 'Owned · drag or select to place'}</small></span></button>)}</div></section> : null; })}</div>
    </details></div><small>Drag an item or use the movement pad for small adjustments.</small>
  </section>;
}
