// Turn one mp4 into a JSON array of ASCII frames.
// Usage: npx tsx scripts/make-ascii.ts <input.mp4> <outSlug> [maxSeconds=3] [fps=10]
//
// Output: public/intro/<outSlug>.json
//   { cols, rows, fps, frames: [string, string, ...] }
// Each frame is "rows" lines joined by \n, each line "cols" chars.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COLS = 48;
const ROWS = 24;
// Dark -> light ramp. Space first so empty = ink-free.
const RAMP = " .:-=+*#%@";

function frameToAscii(buf: Uint8Array): string {
  const lines: string[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    let line = "";
    for (let x = 0; x < COLS; x += 1) {
      const v = buf[y * COLS + x]; // 0..255 luminance
      // Invert: bright pixels -> dense chars so dark UGC on light page reads.
      const idx = Math.min(
        RAMP.length - 1,
        Math.floor((v / 255) * (RAMP.length - 1)),
      );
      line += RAMP[idx];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function main() {
  const [, , input, slug, maxSecArg, fpsArg] = process.argv;
  if (!input || !slug) {
    throw new Error("usage: make-ascii <input.mp4> <outSlug> [maxSec=3] [fps=10]");
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
      "-vf", `fps=${fps},scale=${COLS}:${ROWS}:flags=lanczos`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      tmp,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  const raw = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  const frameSize = COLS * ROWS;
  const frameCount = Math.floor(raw.length / frameSize);
  const frames: string[] = [];
  for (let f = 0; f < frameCount; f += 1) {
    const slice = raw.subarray(f * frameSize, (f + 1) * frameSize);
    frames.push(frameToAscii(slice));
  }

  const outFile = path.join(outDir, `${slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ cols: COLS, rows: ROWS, fps, frames }));
  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`${slug}: ${frameCount} frames @ ${fps}fps -> ${outFile} (${sizeKb} KB)`);
}

main();
