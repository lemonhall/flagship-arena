import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const input = resolve('.cache/godot-exports'), output = resolve('public/assets/ships');
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(input, 'manifest.json'), 'utf8'));
let totalBefore = 0, totalAfter = 0;
for (const [id, entry] of Object.entries(manifest)) {
  const source = resolve(input, `${id}.glb`), target = resolve(output, `${id}.glb`);
  const doc = await io.read(source);
  await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(target, doc);
  const before = (await stat(source)).size, after = (await stat(target)).size;
  totalBefore += before; totalAfter += after;
  entry.bytes = after; entry.compression = 'EXT_meshopt_compression';
  console.log(`${id}: ${(before / 1024).toFixed(0)} -> ${(after / 1024).toFixed(0)} KiB`);
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`ASSETS ${(totalBefore / 1048576).toFixed(2)} -> ${(totalAfter / 1048576).toFixed(2)} MiB`);
