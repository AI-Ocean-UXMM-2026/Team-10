import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mvpCatalog, runtimeAssets } from '../scripts/lib/mvp-catalog.mjs';
import { checkMvpAssets } from '../scripts/check-mvp-assets.mjs';
import { sprite, facings } from '../src/lib/room/room.ts';
import { decorationSprite } from '../src/lib/room/surfaces.ts';
import { WALL_ASSETS } from '../src/lib/room/walls.ts';
test('seven approved catalog items keep stable IDs, exact prices and compatible surfaces', () => {
 assert.deepEqual(mvpCatalog.map(i => [i.id, i.price_coins, i.surface_type]), [
  ['nook-chair-01',3,'floor'], ['nook-desk-01',10,'floor'], ['nook-lamp-01',6,'floor'], ['nook-sofa-01',15,'floor'], ['nook-books-01',2,'tabletop'], ['nook-candle-01',2,'tabletop'], ['nook-painting-01',5,'wall'],
 ]);
 assert.equal(runtimeAssets.length,20);
});
test('catalog variants resolve exactly to adopted room rendering paths', () => {
 for(const item of mvpCatalog) {
  if(item.surface_type==='floor') for(const facing of facings) assert.equal(item.asset_variants[facing],sprite(item.room_kind,facing));
  else if(item.surface_type==='tabletop') assert.equal(item.asset_path,decorationSprite({kind:item.room_kind,turn:0},'frontLeft'));
  else assert.deepEqual(item.asset_variants,WALL_ASSETS[item.room_kind]);
 }
});
test('public art preserves the original 20 sprites inside the curated 67-file runtime package', async () => {
 const checked=await checkMvpAssets();
 assert.equal(checked.files,20);
 assert.equal(checked.runtimeFiles,67);
 const hashes=JSON.parse(await readFile(new URL('../scripts/lib/mvp-runtime-hashes.json',import.meta.url)));
 for(const [asset,hash] of Object.entries(hashes)) {
  const bytes=await readFile(new URL('../public'+asset,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
 }
});
