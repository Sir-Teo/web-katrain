// Fails when a production chunk outgrows its budget.
//
// Run after `npm run build`. The budgets sit a little above the sizes measured
// when they were set, so ordinary changes pass and a new dependency or an
// accidental static import of a lazy module does not slip through unnoticed.
// When a chunk legitimately grows, raise its budget here in the same change
// and say why; when one shrinks, lower it so the saving is kept.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const assetsDir = path.resolve(import.meta.dirname, '..', 'dist', 'assets');

// Sizes in bytes. `gzip` is what a first visit downloads; `raw` is what the
// browser parses and compiles.
const budgets = [
  // Measured 2026-09-27: 783 kB raw / 232 kB gzip, up from 753 / 223 kB with
  // that day's audit fixes (per-tab recovery, per-dialog error boundaries,
  // cross-tab library writes, lazy move history, provenance, clock driver).
  { name: 'main entry', pattern: /^main-[\w-]+\.js$/, raw: 810_000, gzip: 242_000 },
  // Measured 2026-09-27: 824 kB raw / 221 kB gzip, after dropping the tfjs umbrella package
  // (Layers, converter, tf.data, WebGL) in favour of tfjs-core. It was 1.47 MB.
  { name: 'engine worker', pattern: /^worker-[\w-]+\.js$/, raw: 870_000, gzip: 235_000 },
  // Measured 2026-09-27: 195 kB raw / 61 kB gzip.
  { name: 'React vendor', pattern: /^react-vendor-[\w-]+\.js$/, raw: 205_000, gzip: 65_000 },
  // Measured 2026-09-27: 184 kB raw / 31 kB gzip.
  { name: 'main stylesheet', pattern: /^main-[\w-]+\.css$/, raw: 200_000, gzip: 34_000 },
];

if (!fs.existsSync(assetsDir)) {
  console.error(`No build output at ${assetsDir}; run \`npm run build\` first.`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;
let failed = false;

for (const budget of budgets) {
  const matches = files.filter((file) => budget.pattern.test(file));
  if (matches.length !== 1) {
    console.error(`✗ ${budget.name}: expected one chunk matching ${budget.pattern}, found ${matches.length}`);
    failed = true;
    continue;
  }
  const contents = fs.readFileSync(path.join(assetsDir, matches[0]));
  const raw = contents.length;
  const gzip = zlib.gzipSync(contents, { level: 9 }).length;
  const over = raw > budget.raw || gzip > budget.gzip;
  failed ||= over;
  console.log(
    `${over ? '✗' : '✓'} ${budget.name}: ${kb(raw)} raw (budget ${kb(budget.raw)}), ` +
      `${kb(gzip)} gzip (budget ${kb(budget.gzip)})`,
  );
}

if (failed) {
  console.error('\nA chunk is over budget. See the notes in scripts/check-bundle-budget.mjs.');
  process.exit(1);
}
