// Generates the PWA icon set from the pixel-art grid below.
//
// The art is kept as source (a character grid) rather than a binary blob so it
// stays editable — tweak SPRITE, re-run `npm run icons`, done. Every output is
// an integer-scaled nearest-neighbour blit of the grid onto a flat background,
// so pixels stay crisp at any target size; leftover pixels become background
// padding, which is invisible because the background is flat.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PALETTE = {
  ".": "#43301a", // soil background
  o: "#2a1c0d", // outline
  L: "#f5cd85", // potato, lit
  M: "#dda65a", // potato, mid
  D: "#bd8038", // potato, shaded
  d: "#ad7330", // sprout-bud dimple
};

// 20x20. Outer ring must stay background so the padding trick is invisible.
const SPRITE = [
  "....................",
  ".......ooooo........",
  "......oLLLLLo.......",
  ".....oLLLLLLLo......",
  ".....oLLLLLLMo......",
  ".....oLdLLLLMo......",
  "....oLLLLLLLMMo.....",
  "....oLLLLLLLMMo.....",
  "....oLLLLLLLMMo.....",
  "....oLLLLLdMMMo.....",
  "....oLLLLLLMMMo.....",
  "....oLLLLLLMMMo.....",
  "....oLLLLLMMMMo.....",
  ".....oLdLMMMMo......",
  ".....oLLMMDDDo......",
  ".....oMMDDDDDo......",
  "......oDDDDDo.......",
  ".......ooooo........",
  "....................",
  "....................",
];

const GRID = SPRITE.length;

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    pixels.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// `coverage` is how much of the canvas the sprite is allowed to fill. Maskable
// icons get a smaller value so nothing important survives outside Android's
// 80% safe zone.
function render(size, coverage = 1) {
  const scale = Math.max(1, Math.floor((size * coverage) / GRID));
  const drawn = scale * GRID;
  const offset = Math.floor((size - drawn) / 2);
  const bg = rgb(PALETTE["."]);

  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) pixels.set(bg, i * 3);

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const key = SPRITE[gy][gx];
      const color = PALETTE[key];
      if (!color) throw new Error(`no palette entry for "${key}"`);
      if (key === ".") continue;
      const c = rgb(color);
      for (let y = 0; y < scale; y++) {
        const py = offset + gy * scale + y;
        if (py < 0 || py >= size) continue;
        for (let x = 0; x < scale; x++) {
          const px = offset + gx * scale + x;
          if (px < 0 || px >= size) continue;
          pixels.set(c, (py * size + px) * 3);
        }
      }
    }
  }
  return encodePng(size, pixels);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(outDir, { recursive: true });

const targets = [
  ["icon-60.png", 60, 1],
  ["icon-180.png", 180, 1],
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.76],
];

for (const [name, size, coverage] of targets) {
  const png = render(size, coverage);
  writeFileSync(join(outDir, name), png);
  console.log(`${name}  ${size}x${size}  ${png.length}b`);
}
