import type { RoomState } from '@/lib/room/roomState';

// Public illustration based on the owner's reference. It is never account data.
export const exampleRoom: RoomState = {
  version: 2,
  items: [
    { id:'example-desk', kind:'desk', x:1.25, y:3, facing:'frontRight', groundOffset:{x:1,y:2} },
    { id:'example-chair', kind:'chair', x:2.5, y:3.5, facing:'backRight', groundOffset:{x:1,y:1} },
    { id:'example-bed', kind:'bed', x:.25, y:0, facing:'frontRight', groundOffset:{x:3,y:2} },
    { id:'example-bedside', kind:'white-bedside', x:.5, y:2, facing:'frontLeft', groundOffset:{x:1,y:1} },
    { id:'example-table', kind:'wooden_table', x:3.5, y:.25, facing:'frontLeft', groundOffset:{x:2,y:1} },
    { id:'example-bookcase', kind:'bookcase', x:6.75, y:0, facing:'frontLeft', groundOffset:{x:1,y:1} },
    { id:'example-drawers', kind:'green-drawers', x:.25, y:6, facing:'frontRight', groundOffset:{x:1,y:1} },
    { id:'example-aquarium', kind:'aquarium', x:2.75, y:6.5, facing:'frontLeft', groundOffset:{x:2,y:1} },
  ],
  decorations: [
    { id:'example-books', kind:'books', parentId:'example-desk', surfaceId:'desktop', u:.45, v:.5, turn:0 },
    { id:'example-laptop', kind:'laptop', parentId:'example-desk', surfaceId:'desktop', u:1.35, v:.5, turn:0 },
    { id:'example-lamp', kind:'lamp', parentId:'example-bedside', surfaceId:'desktop', u:.5, v:.5, turn:0 },
    { id:'example-teddy', kind:'teddy-cream', parentId:'example-table', surfaceId:'desktop', u:1.4, v:.5, turn:0 },
  ],
  wallDecorations: [
    { id:'example-painting', kind:'painting', wall:'left', u:6, v:5.4 },
    { id:'example-landscape', kind:'large-green-landscape', wall:'left', u:3.4, v:6.8 },
    { id:'example-clock', kind:'clock-charcoal', wall:'left', u:.9, v:8.8 },
    { id:'example-window', kind:'window', wall:'right', u:3.2, v:6.4 },
  ],
};
