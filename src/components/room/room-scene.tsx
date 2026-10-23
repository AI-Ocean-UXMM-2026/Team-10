'use client';
import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from 'react';
import { depthOrder, diamond, dragPosition, footprintPolygon, snapPosition, type Item, type Point } from '@/lib/room/room';
import { floorSprite, spriteBox, smallFloorMetadata } from '@/lib/room/spriteGeometry';
import { grabAt, decorationTarget as automaticDecorationTarget, floorTarget, isDecoration, wallTarget, type Grab, type Target } from '@/lib/room/targets';
import { decorationDepthOrder, decorationDragPosition, decorationPolygon, decorationRendering, snapSurface } from '@/lib/room/surfaces';
import { wallFootprint, wallRendering } from '@/lib/room/walls';
import { entityError, replaceEntity, type Entity } from '@/lib/room/editing';
import { SCENE, fittedScene, screenToRoom } from '@/lib/room/viewport';
import type { RoomState } from '@/lib/room/roomState';
function RoomImage({ href, ...box }: { href: string; x: number; y: number; width: number; height: number }) {
  const [failedHref, setFailedHref] = useState<string | null>(null);
  return failedHref === href ? <g><rect {...box} fill="#edf2e9" stroke="#315d4d" /><text x={box.x + box.width / 2} y={box.y + box.height / 2} fontSize="14" textAnchor="middle">Item</text></g> : <image href={href} {...box} onError={() => setFailedHref(href)} preserveAspectRatio="xMidYMax meet" />;
}
export type RoomSceneHandle = { beginInventory:(event:PointerEvent<HTMLButtonElement>,entity:Entity,onTap:()=>void)=>void };
export function RoomScene({ room, selected, editable = false, disabled = false, naturalPlacement = false, labels, dragRef, onSelect, onMove, onNotice }: { room: RoomState; selected?: string; editable?: boolean; disabled?: boolean; naturalPlacement?:boolean; labels?:Record<string,string>; dragRef?:Ref<RoomSceneHandle>; onSelect?: (id: string) => void; onMove?: (entity: Entity) => void; onNotice?: (text: string) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 664, height: 380 });
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const gesture = useRef<{ entity: Entity; start: Point; clientStart: Point; pointer: number; active: boolean; candidate: Entity; grab:Grab; external:boolean; target?:Target; onTap?:()=>void } | null>(null);
  const pan = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);
  const [preview, setPreview] = useState<Entity | null>(null);
  const [hover, setHover] = useState<Target | null>(null);
  const [zoom, setZoom] = useState(100);
  const fitted = fittedScene(size.width, size.height, zoom);
  function decorationTarget(entity: Entity, pointer: Point): Entity {
    if (!isDecoration(entity)) return entity;
    const parent = 'parentId' in entity ? room.items.find(i => i.id === entity.parentId) : null;
    if ('parentId' in entity && !parent) return entity;
    // Expanded targets can overlap on a small desk. Pick the nearest artwork
    // centre, rather than whichever transparent rectangle was painted last.
    const entries:Entity[] = parent ? room.decorations.filter(d => d.parentId === parent.id) : room.items.filter(isDecoration);
    const candidates = entries.map(d => {
      const view = 'parentId' in d ? decorationRendering(d, parent!) : spriteBox(d as Item), box = hitBox(view);
      return { entity: d, box, distance: Math.hypot(pointer.x - (view.x + view.width / 2), pointer.y - (view.y + view.height / 2)) };
    }).filter(({ box }) => pointer.x >= box.x && pointer.x <= box.x + box.width && pointer.y >= box.y && pointer.y <= box.y + box.height);
    return candidates.sort((a, b) => a.distance - b.distance)[0]?.entity ?? entity;
  }
  function hitBox(view: { x: number; y: number; width: number; height: number }) {
    const width = Math.max(view.width, 24 / fitted.scale), height = Math.max(view.height, 24 / fitted.scale);
    return { x: view.x + (view.width - width) / 2, y: view.y + (view.height - height) / 2, width, height };
  }
  useEffect(() => {
    const cancel = () => {
      const pointer = gesture.current?.pointer ?? pan.current?.pointer; gesture.current = null; pan.current = null; setPreview(null); setHover(null);
      if (pointer !== undefined && svg.current?.hasPointerCapture(pointer)) svg.current.releasePointerCapture(pointer);
    };
    window.addEventListener('blur', cancel); window.addEventListener('resize', cancel); document.addEventListener('visibilitychange', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel); document.removeEventListener('visibilitychange', cancel); };
  }, []);
  function point(event: {clientX:number;clientY:number}) { const matrix = svg.current?.getScreenCTM(); return matrix ? screenToRoom({ x: event.clientX, y: event.clientY }, matrix) : null; }
  function begin(event: PointerEvent<SVGGElement|HTMLButtonElement>, entity: Entity, external=false, onTap?:()=>void) {
    if (!editable || disabled || gesture.current || pan.current || !event.isPrimary || event.button !== 0) return;
    event.stopPropagation(); const start = point(event); if (!start) return;
    event.preventDefault();
    if(!external)entity = decorationTarget(entity, start);
    onSelect?.(entity.id); gesture.current = { entity, start, clientStart: { x: event.clientX, y: event.clientY }, pointer: event.pointerId, active: false, candidate: entity, grab:external?{x:.5,y:.75}:grabAt(entity,room,start),external,onTap };
    // Furniture/decoration nodes move during depth sorting. Capture on the stable
    // scene so DOM reordering cannot silently cancel an otherwise valid gesture.
    svg.current?.setPointerCapture(event.pointerId);
    svg.current?.focus({ preventScroll: true });
  }
  useImperativeHandle(dragRef,()=>({beginInventory:(event,entity,onTap)=>begin(event,entity,true,onTap)}));
  function beginPan(event: PointerEvent<SVGSVGElement>) {
    if (!editable || disabled || zoom <= 100 || gesture.current || pan.current || !event.isPrimary || event.button !== 0 || !viewport.current) return;
    event.preventDefault();
    pan.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop };
    svg.current?.setPointerCapture(event.pointerId);
    svg.current?.focus({ preventScroll: true });
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (disabled) { finish(true); return; }
    const panning = pan.current;
    if (panning?.pointer === event.pointerId) {
      event.preventDefault();
      viewport.current?.scrollTo(panning.left - event.clientX + panning.x, panning.top - event.clientY + panning.y);
      return;
    }
    const current = gesture.current; let now = point(event); if (!current || !now || current.pointer !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.clientStart.x, event.clientY - current.clientStart.y) < 4) return;
    if(!current.active && current.external) {viewport.current?.scrollIntoView({block:'center',behavior:'instant'});now=point(event)!;}
    current.active = true; event.preventDefault(); const entity = current.entity;
    if ('wall' in entity) { current.target=wallTarget(room,entity,now,current.grab,current.target?.wall); current.candidate=current.target.entity; }
    else if (naturalPlacement && isDecoration(entity)) {current.target=automaticDecorationTarget(room,entity,now,current.grab,current.target?.parentId);current.candidate=current.target.entity;}
    else if (current.external && 'facing' in entity) current.candidate=floorTarget(entity,room,now,current.grab);
    else if ('facing' in entity) current.candidate = { ...entity, ...snapPosition(dragPosition(entity, current.start, now)) };
    else if ('parentId' in entity) { const parent = room.items.find(i => i.id === entity.parentId); if (!parent) return; const p = snapSurface(decorationDragPosition(parent, entity, current.start, now)); current.candidate = { ...entity, u: p.x, v: p.y }; }
    setHover(current.target??null);
    setPreview(current.candidate);
  }
  function finish(cancelled = false) {
    const current = gesture.current; gesture.current = null; setPreview(null);setHover(null);
    const pointer = current?.pointer ?? pan.current?.pointer; pan.current = null;
    if (pointer !== undefined && svg.current?.hasPointerCapture(pointer)) svg.current.releasePointerCapture(pointer);
    if (cancelled || disabled) return;
    if(!current?.active){current?.onTap?.();return;}
    const error = current.target?.error ?? entityError(current.candidate, room);
    if (error) onNotice?.(`${error} Previous placement kept.`); else onMove?.(current.candidate);
  }
  const displayed = preview ? replaceEntity(room, preview) : room;
  const invalid = hover?.error ?? (preview ? entityError(preview, room) : null);
  const selectedEntity = [...room.items, ...room.decorations, ...(room.wallDecorations ?? [])].find(e => e.id === selected);
  function focusSelection() {
    if (!selectedEntity) return;
    setZoom(200);
    // Explicit closer inspection uses the existing zoom/scroll viewport only.
    // Selection, saves and furniture movement never reframe the scene themselves.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const node = [...(svg.current?.querySelectorAll<SVGGElement>('[data-room-id]') ?? [])].find(n => n.dataset.roomId === selectedEntity.id);
      const container = viewport.current;
      if (!node || !container) return;
      const box = node.getBoundingClientRect(), frame = container.getBoundingClientRect();
      container.scrollBy({ left: box.x + box.width / 2 - frame.x - frame.width / 2, top: box.y + box.height / 2 - frame.y - frame.height / 2 });
    }));
  }
  function selectable(entity: Entity) {
    return editable ? { role: 'button' as const, tabIndex: 0, 'data-room-id': entity.id, 'data-room-kind':entity.kind, 'data-placement': 'parentId' in entity ? 'tabletop' : 'wall' in entity ? 'wall' : 'floor', 'data-preview': preview?.id === entity.id || undefined, 'aria-label': `Select ${labels?.[entity.id] ?? entity.kind}`, 'aria-pressed': selected === entity.id, onPointerDown: (e: PointerEvent<SVGGElement>) => begin(e, entity), onClick: () => !disabled && onSelect?.(entity.id), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) onSelect?.(entity.id); } } } : {};
  }
  function floorArt(parent:Item) {
    const box=spriteBox(parent),meta=smallFloorMetadata(parent);
    return <>{editable && isDecoration(parent) && <rect {...hitBox(box)} className={`decoration-hit-area ${selected===parent.id?'selected':''}`} aria-hidden="true" />}{meta ? <svg {...box} viewBox={`${meta.bounds[0]} ${meta.bounds[1]} ${meta.bounds[2]-meta.bounds[0]} ${meta.bounds[3]-meta.bounds[1]}`}><RoomImage href={floorSprite(parent)} x={0} y={0} width={meta.width} height={meta.height} /></svg> : <RoomImage href={floorSprite(parent)} {...box} />}</>;
  }
  const outline = (entity: Entity) => 'facing' in entity ? footprintPolygon(entity) : 'parentId' in entity ? decorationPolygon(entity, displayed.items.find(i => i.id === entity.parentId)!) : wallFootprint(entity);
  return <div className="room-view">{editable && <div className="actions view-tools"><button disabled={disabled || zoom <= 75} onClick={() => setZoom(z => z - 25)} aria-label="Zoom out">−</button><span>{zoom}%</span><button disabled={disabled || zoom >= 200} onClick={() => setZoom(z => z + 25)} aria-label="Zoom in">+</button><button disabled={disabled} onClick={() => { setZoom(100); viewport.current?.scrollTo(0, 0); }}>Fit room</button><button disabled={disabled || !selectedEntity} onClick={focusSelection}>Focus selected item</button><small>Drag background or scroll to pan when zoomed.</small></div>}
    <div ref={viewport} className="room-scroll" tabIndex={editable ? 0 : undefined} aria-label="Room viewport"><div className="room-stage" style={{ minWidth: fitted.width, minHeight: fitted.height }}><svg ref={svg} className={editable ? 'room-scene editable' : 'room-scene'} data-hover-parent={hover?.parentId} data-hover-wall={hover?.wall} data-target-valid={hover ? String(!invalid) : undefined} data-dragging={preview ? 'true' : undefined} style={{ width: fitted.width, height: fitted.height }} viewBox={`${SCENE.x} ${SCENE.y} ${SCENE.width} ${SCENE.height}`} role="group" tabIndex={editable ? -1 : undefined} aria-label="Your isometric study room" onPointerDown={beginPan} onPointerMove={move} onPointerUp={e => { if ((e.pointerId === gesture.current?.pointer || e.pointerId === pan.current?.pointer)) finish(); }} onPointerCancel={e => { if ((e.pointerId === gesture.current?.pointer || e.pointerId === pan.current?.pointer)) finish(true); }} onLostPointerCapture={e => { if ((e.pointerId === gesture.current?.pointer || e.pointerId === pan.current?.pointer)) finish(true); }} onKeyDown={e => { if (e.key === 'Escape') finish(true); }}>
      <polygon points="380,175 60,335 60,110 380,-50" fill="#e5ddc8" stroke="#9a8d72" strokeWidth="3" /><polygon points="380,175 700,335 700,110 380,-50" fill="#d0c6ab" stroke="#9a8d72" strokeWidth="3" />
      {(displayed.wallDecorations ?? []).map(entity => { const view = wallRendering(entity); return <g key={entity.id} {...selectable(entity)}><RoomImage href={view.href} x={view.x} y={view.y} width={view.width} height={view.height} />{selected === entity.id && <polygon points={wallFootprint(entity)} className="selection-outline" />}</g>; })}
      <polygon points={diamond(0, 0, 8, 8)} fill="#e7d7b8" stroke="#9a8d72" strokeWidth="3" />
      {Array.from({ length: 64 }, (_, i) => <polygon key={i} points={diamond(i % 8, Math.floor(i / 8))} fill={i % 2 ? '#e1ceb0' : '#e7d7b8'} stroke="#cfba99" strokeWidth=".6" />)}
      {[...displayed.items].sort(depthOrder).map((parent: Item) => <g key={parent.id}><g {...selectable(parent)}>{floorArt(parent)}{selected === parent.id && <polygon points={footprintPolygon(parent)} className="selection-outline" />}</g>{displayed.decorations.filter(d => d.parentId === parent.id).sort((a, b) => decorationDepthOrder(parent, a, b)).map(entity => { const view = decorationRendering(entity, parent); return <g key={entity.id} {...selectable(entity)}>{editable && <rect {...hitBox(view)} className={`decoration-hit-area ${selected === entity.id ? 'selected' : ''}`} aria-hidden="true" />}<svg x={view.x} y={view.y} width={view.width} height={view.height} viewBox={view.viewBox} overflow="visible"><RoomImage href={view.href} x={0} y={0} width={view.meta.width} height={view.meta.height} /></svg>{selected === entity.id && <polygon points={decorationPolygon(entity, parent)} className="selection-outline" />}</g>; })}</g>)}
      {hover?.polygon && <polygon data-placement-target points={hover.polygon} className={invalid ? "surface-target invalid" : "surface-target"} />}
      {preview && <polygon points={outline(preview)} className={invalid ? 'placement-outline invalid' : 'placement-outline'} />}
    </svg></div></div>{preview && <p role="status">{invalid ? `${invalid} Release keeps the previous position.` : 'Valid placement. Release to place.'}</p>}</div>;
}
