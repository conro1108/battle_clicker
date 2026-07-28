/**
 * Char-grid pixel art, the same technique cozy_sprites uses: art is authored as
 * rows of single-character keys plus a tiny palette, rendered once into an
 * offscreen canvas and cached.
 *
 * Two consumers, two shapes:
 *  - the scene blits `artCanvas` straight onto its low-res buffer, so the art
 *    stays on the buffer's pixel grid and never resamples;
 *  - the DOM uses `artUrl` in an `<img class="pxicon">`, upscaled by CSS with
 *    `image-rendering: pixelated`.
 *
 * Rows don't have to be the same length — the grid is padded to the longest —
 * which keeps hand-authored art editable without counting dots.
 */

export interface Art {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const spriteCache = new WeakMap<Art, Sprite>();
const urlCache = new WeakMap<Art, string>();

/** `.` (and any key missing from the palette) is transparent. */
function paint(art: Art, scale: number): Sprite {
  const rows = art.rows;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const h = rows.length;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w * scale);
  canvas.height = Math.max(1, h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < row.length; x++) {
      const color = art.palette[row[x] ?? "."];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return { canvas, w, h };
}

/** 1:1 sprite for blitting onto the scene buffer. Cached per art object. */
export function artCanvas(art: Art): Sprite {
  let sprite = spriteCache.get(art);
  if (!sprite) {
    sprite = paint(art, 1);
    spriteCache.set(art, sprite);
  }
  return sprite;
}

/**
 * Data URL for DOM use. Rendered at 4x rather than 1x because Safari resamples
 * very small images on its own before `image-rendering: pixelated` gets a say,
 * and a 12px icon blown up to 24 comes out soft.
 */
export function artUrl(art: Art): string {
  let url = urlCache.get(art);
  if (!url) {
    url = paint(art, 4).canvas.toDataURL();
    urlCache.set(art, url);
  }
  return url;
}

export function artSize(art: Art): { w: number; h: number } {
  const s = artCanvas(art);
  return { w: s.w, h: s.h };
}

/**
 * Recolour a sprite in place-ish: returns a tinted copy, cached per (art, tint).
 * Used for broken kit, which reads as the same machine gone grey and dead
 * rather than a second set of art to keep in sync.
 */
const tintCache = new Map<string, Sprite>();
let tintKey = 0;
const tintIds = new WeakMap<Art, number>();

export function artTinted(art: Art, tint: string, alpha = 0.55): Sprite {
  let id = tintIds.get(art);
  if (id === undefined) {
    id = tintKey++;
    tintIds.set(art, id);
  }
  const key = `${id}:${tint}:${alpha}`;
  const hit = tintCache.get(key);
  if (hit) return hit;

  const base = artCanvas(art);
  const canvas = document.createElement("canvas");
  canvas.width = base.w;
  canvas.height = base.h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base.canvas, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, base.w, base.h);

  const sprite = { canvas, w: base.w, h: base.h };
  tintCache.set(key, sprite);
  return sprite;
}
