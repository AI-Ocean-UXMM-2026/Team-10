import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access } from 'node:fs/promises';
import { exampleRoom } from '../src/components/room/example-layout.ts';
import { entityList, layoutError } from '../src/lib/room/editing.ts';
import { sprite } from '../src/lib/room/room.ts';
import { decorationSprite, decorationFacing } from '../src/lib/room/surfaces.ts';
import { WALL_ASSETS } from '../src/lib/room/walls.ts';

test('public reference composition is valid, read-only scene data with the 16 requested objects', async () => {
  assert.equal(layoutError(exampleRoom),null);
  const entities=entityList(exampleRoom);
  assert.equal(entities.length,16);assert.equal(new Set(entities.map(e=>e.id)).size,16);
  assert.deepEqual(entities.map(e=>e.kind).sort(),['desk','chair','laptop','books','bed','white-bedside','lamp','wooden_table','teddy-cream','aquarium','bookcase','green-drawers','painting','large-green-landscape','clock-charcoal','window'].sort());
  for(const entity of entities) {
    assert.ok(entity.id.startsWith('example-'));
    const asset='facing' in entity ? sprite(entity.kind,entity.facing) : 'wall' in entity ? WALL_ASSETS[entity.kind][entity.wall] : decorationSprite(entity,decorationFacing(entity,exampleRoom.items.find(p=>p.id===entity.parentId)));
    await access(new URL('../public'+asset,import.meta.url));
  }
});
