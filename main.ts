// SOLMARA — a gta6-01 entry program (Node 22, standard library only).
//
// What it does: copies this repository's game/ and screenshots/ into the output
// directory and writes /output/dossier.json with the vendored make.fun library,
// so the sealed scorer can gate the entry and the judge can read it.
//
// How it stays deterministic: the copy is a plain recursive walk in sorted
// order, the dossier is built from the copied tree, and nothing here touches
// the network, the clock or the environment beyond MAKEFUN_OUTPUT_DIR.
//
// One Docker-volume lesson is baked in: the grader mounts the output directory,
// so this program clears the output directory's CONTENTS entry by entry and
// never removes the directory itself (rmSync on /output fails on that mount).
//
// Run it outside the grader with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, from the kit's reference/gate.json: only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry the
// scorer would refuse anyway (more than 4 screenshots or one over 256 KiB;
// more than 993 entries in game/ or 48 MiB of game files; a game path over
// 1000 bytes). game/ counts beside /output's own 1000-entry cap, which
// game/, screenshots/ and dossier.json share.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Empty a directory without removing the directory itself. */
function clearContents(dir) {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** Copy one tree into the output, creating the destination first. */
function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

clearContents(outDir);
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
} else {
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));
