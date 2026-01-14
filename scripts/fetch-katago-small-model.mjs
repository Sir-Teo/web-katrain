import fs from 'node:fs/promises';
import path from 'node:path';

const MODEL_URL =
  'https://raw.githubusercontent.com/lightvector/KataGo/master/cpp/tests/models/g170-b6c96-s175395328-d26788732.bin.gz';
const KATRAIN_MODEL_NAME = 'kata1-b18c384nbt-s9996604416-d4316597426.bin.gz';
const KATRAIN_MODEL_URL =
  'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'public', 'models');
const outPath = path.join(outDir, 'katago-small.bin.gz');
const katrainSrcPath = path.resolve(projectRoot, '..', 'katrain-ref', 'katrain', 'models', KATRAIN_MODEL_NAME);
const katrainOutPath = path.join(outDir, KATRAIN_MODEL_NAME);

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureCopiedModel(srcPath, destPath) {
  try {
    const [srcStat, destStat] = await Promise.all([fs.stat(srcPath), fs.stat(destPath).catch(() => null)]);
    if (destStat && destStat.size === srcStat.size) {
      console.log(`Model already present: ${path.relative(projectRoot, destPath)}`);
      return true;
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
    console.log(`Copied: ${path.relative(projectRoot, destPath)} (${srcStat.size} bytes)`);
    return true;
  } catch {
    return false;
  }
}

async function downloadModel(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download model: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
  console.log(`Saved: ${path.relative(projectRoot, destPath)} (${buf.length} bytes)`);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  // Prefer KaTrain's default model if available locally (sibling checkout under ../katrain-ref/).
  const copied = await ensureCopiedModel(katrainSrcPath, katrainOutPath);
  if (copied) {
    console.log(`KaTrain model ready: ${path.relative(projectRoot, katrainOutPath)}`);
  } else if (await exists(katrainOutPath)) {
    console.log(`KaTrain model already present: ${path.relative(projectRoot, katrainOutPath)}`);
  } else {
    console.log(`KaTrain model not found at ${path.relative(projectRoot, katrainSrcPath)} (downloading)`);
    await downloadModel(KATRAIN_MODEL_URL, katrainOutPath);
  }

  if (await exists(outPath)) {
    console.log(`Model already present: ${path.relative(projectRoot, outPath)}`);
    return;
  }

  console.log(`Downloading model from ${MODEL_URL}`);
  await downloadModel(MODEL_URL, outPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
