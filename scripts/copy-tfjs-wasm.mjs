import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const wasmSrcDir = path.join(projectRoot, 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist');
const wasmOutDir = path.join(projectRoot, 'public', 'tfjs');

async function listWasmFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.wasm')).map((e) => e.name);
}

async function main() {
  await fs.mkdir(wasmOutDir, { recursive: true });
  const wasmFiles = await listWasmFiles(wasmSrcDir);
  if (wasmFiles.length === 0) throw new Error(`No .wasm files found in ${wasmSrcDir}`);

  await Promise.all(
    wasmFiles.map(async (name) => {
      const src = path.join(wasmSrcDir, name);
      const dst = path.join(wasmOutDir, name);
      await fs.copyFile(src, dst);
    })
  );
  console.log(`Copied ${wasmFiles.length} wasm files to ${path.relative(projectRoot, wasmOutDir)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

