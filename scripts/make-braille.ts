// Turn one mp4 into a JSON array of Braille-dot frames.
// Each char cell packs 2x4 pixels via the Unicode Braille block (U+2800..),
// so faces/bodies read a lot crisper than the ASCII-ramp version.
//
// Usage: npx tsx scripts/make-braille.ts <input.mp4> <outSlug> [maxSec=3] [fps=10]
// Output: public/intro/<outSlug>.json  { cols, rows, fps, frames }

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COLS = 48;           // character columns per frame
const ROWS = 24;           // character rows per frame
const PIX_W = COLS * 2;    // 96 pixels wide
const PIX_H = ROWS * 4;    // 96 pixels tall
const THRESHOLD = 128;     // luminance cutoff per dot

// Braille 8-dot bit values laid out as [x][y] -> bit mask.
// Dot order (per Unicode):  1 4
//                           2 5
//                           3 6
//                           7 8
const BIT = [
  [0x01, 0x02, 0x04, 0x40], // x=0, y=0..3
  [0x08, 0x10, 0x20, 0x80], // x=1, y=0..3
];
const BRAILLE_BASE = 0x2800;

function frameToBraille(buf: Uint8Array): string {
  const lines: string[] = [];
  for (let cy = 0; cy < ROWS; cy += 1) {
    let line = "";
    for (let cx = 0; cx < COLS; cx += 1) {
      let bits = 0;
      for (let dx = 0; dx < 2; dx += 1) {
        for (let dy = 0; dy < 4; dy += 1) {
          const px = cx * 2 + dx;
          const py = cy * 4 + dy;
          const v = buf[py * PIX_W + px];
          // Bright pixel -> dot ON, so dark UGC subject on light page reads
          // as dense braille. (Invert if backgrounds end up darker.)
          if (v > THRESHOLD) bits |= BIT[dx][dy];
        }
      }
      // U+2800 is a fully blank braille char — keep it so empty space
      // renders as a space-width glyph instead of collapsing.
      line += String.fromCharCode(BRAILLE_BASE + bits);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function main() {
  const [, , input, slug, maxSecArg, fpsArg] = process.argv;
  if (!input || !slug) {
    throw new Error("usage: make-braille <input.mp4> <outSlug> [maxSec=3] [fps=10]");
  }
  const maxSec = Number(maxSecArg ?? 3);
  const fps = Number(fpsArg ?? 10);
  const outDir = path.resolve(process.cwd(), "public/intro");
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, `.${slug}.gray`);

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", input,
      "-t", String(maxSec),
      "-vf", `fps=${fps},scale=${PIX_W}:${PIX_H}:flags=lanczos`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      tmp,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  const raw = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  const frameSize = PIX_W * PIX_H;
  const frameCount = Math.floor(raw.length / frameSize);
  const frames: string[] = [];
  for (let f = 0; f < frameCount; f += 1) {
    const slice = raw.subarray(f * frameSize, (f + 1) * frameSize);
    frames.push(frameToBraille(slice));
  }

  const outFile = path.join(outDir, `${slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ cols: COLS, rows: ROWS, fps, frames }));
  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`${slug}: ${frameCount} braille frames @ ${fps}fps -> ${outFile} (${sizeKb} KB)`);
}

main();
