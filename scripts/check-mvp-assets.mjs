import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runtimeAssets } from './lib/mvp-catalog.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function checkMvpAssets() {
  const base = path.join(root, 'public/assets/room');
  const hashes = JSON.parse(await readFile(path.join(root, 'scripts/lib/room-runtime-hashes.json')));
  const expected = new Set(Object.keys(hashes).map(asset => asset.slice('/assets/room/'.length)));
  const actual = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) actual.push(relative);
      else throw new Error(`Unexpected linked/special asset: ${relative}`);
    }
  }
  try { await walk(base); } catch(error) { if(error.code === 'ENOENT') throw new Error('Room runtime art is missing. Restore the curated 67-file subset with node scripts/prepare-room-release-assets.mjs from your licensed private source before building.'); throw error; }
  if (actual.length !== expected.size || actual.some(file => !expected.has(file))) throw new Error('The public room directory must contain exactly the 67 manifest-listed runtime PNGs; keep original packs and unused assets private.');
  const sprites = JSON.parse(await readFile(path.join(root, 'src/lib/room/sprites.json')));
  const decorations = JSON.parse(await readFile(path.join(root, 'src/lib/room/decorations.json')));
  const walls = JSON.parse(await readFile(path.join(root, 'src/lib/room/wallSprites.json')));
  const mvpHashes = JSON.parse(await readFile(path.join(root, 'scripts/lib/mvp-runtime-hashes.json')));
  for (const asset of runtimeAssets) if (hashes[asset] !== mvpHashes[asset]) throw new Error(`Existing MVP sprite changed: ${asset}`);
  for (const relative of actual) {
    const bytes = await readFile(path.join(base, relative));
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Invalid PNG: ${relative}`);
    if (createHash('sha256').update(bytes).digest('hex') !== hashes['/assets/room/' + relative]) throw new Error(`Runtime art differs from the reviewed allowlist: ${relative}`);
    const name = path.basename(relative, '.png');
    const meta = relative.startsWith('normalized/') ? sprites[name] : relative.startsWith('wall-decorations/') ? walls[name] : decorations[name];
    if (!meta || bytes.readUInt32BE(16) !== meta.width || bytes.readUInt32BE(20) !== meta.height) throw new Error(`Sprite dimensions disagree with the calibrated geometry: ${relative}`);
  }
  return { files: runtimeAssets.length, runtimeFiles: actual.length, dimensions: 'match adopted Room Lab calibration', originalsOrArchives: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try { console.log(JSON.stringify(await checkMvpAssets())); } catch(error) { console.error(error.message); process.exitCode = 1; }
}
