/**
 * Every piece of pixel art in the game, as char grids.
 *
 * Two families live here. `ICONS` are 12x12 UI glyphs that replace what used to
 * be plain text and emoji in the chrome. `PROPS` are the scene's furniture:
 * one silhouette per producer tier, the pieces the potato hoard is built out
 * of, and the scenery around both.
 *
 * The one hard rule is the shared outline ink (`K`) — it's what makes a barn, a
 * combine harvester and a UI button icon look like they came out of the same
 * box of crayons.
 */

import type { Art } from "./pixel.js";

const K = "#402e3a"; // shared outline ink

// Palettes are per-art and deliberately tiny; these are the recurring members.
const POTATO = { p: "#c98b4b", l: "#e2b077", d: "#95602c" };
const METAL = { m: "#a8b0b8", s: "#7f8891", g: "#bfe3ef" };
const WOOD = { w: "#7a5237", v: "#5e3e29" };

// ---------------------------------------------------------------------------
// UI icons — 12x12
// ---------------------------------------------------------------------------

export const ICONS = {
  // Oblong and tilted, not a disc. The old one was a circle with shading on
  // it, and a circle of that colour on a button is a biscuit.
  potato: {
    rows: [
      "............",
      ".....kkkkk..",
      "...kkllppdk.",
      "..kllpppppdk",
      ".kllpdppppdk",
      ".klppppppddk",
      "kllppppppdk.",
      "kppppdpppdk.",
      "kpppppppdk..",
      ".kkppppddk..",
      "...kkkkkk...",
      "............",
    ],
    palette: { k: K, ...POTATO },
  },

  sprout: {
    rows: [
      "......k.....",
      ".kkk..k..kk.",
      "kgggk.k.kgk.",
      "kgggkkkkggk.",
      ".kggggkggkk.",
      "...kkgkkk...",
      ".....g......",
      ".....g......",
      ".....g......",
      "..kkkkkkk...",
      "..kdddddk...",
      "...kkkkk....",
    ],
    palette: { k: K, g: "#6aa348", d: "#8a5f3f" },
  },

  basket: {
    rows: [
      "...kk..kk...",
      "..k.kkkk.k..",
      "..k.k..k.k..",
      "kkkkkkkkkkkk",
      "kbbbbbbbbbbk",
      "kbllbbbbllbk",
      "kbbbbbbbbbbk",
      "kbllbbbbllbk",
      ".kbbbbbbbbk.",
      ".kbllbbllbk.",
      "..kbbbbbbk..",
      "...kkkkkk...",
    ],
    palette: { k: K, b: "#b07c42", l: "#d6a86a" },
  },

  shield: {
    rows: [
      "kkkkkkkkkkkk",
      "kggggggggggk",
      "kgglggggggkk",
      "kggllgggggk.",
      "kgggggggggk.",
      ".kggggggggk.",
      ".kgggggggk..",
      "..kggggggk..",
      "..kgggggk...",
      "...kgggk....",
      "....kgk.....",
      ".....k......",
    ],
    palette: { k: K, g: "#5f9c46", l: "#8cc35f" },
  },

  clipboard: {
    rows: [
      "....kkkkk...",
      "..kkkccckkk.",
      "..kpppppppk.",
      "..kplllllpk.",
      "..kpppppppk.",
      "..kplllllpk.",
      "..kpppppppk.",
      "..kplllllpk.",
      "..kpppppppk.",
      "..kpppppppk.",
      "..kkkkkkkkk.",
      "............",
    ],
    palette: { k: K, p: "#fdf3e0", c: "#c9a96a", l: "#c9b896" },
  },

  house: {
    rows: [
      ".....kk.....",
      "....krrk....",
      "...krrrrk...",
      "..krrrrrrk..",
      ".krrrrrrrrk.",
      "krrrrrrrrrrk",
      "kkkkkkkkkkkk",
      "kbbbkbbkbbbk",
      "kbbbkbbkbbbk",
      "kbbbkbbkbbbk",
      "kbbbkkkkbbbk",
      "kkkkkkkkkkkk",
    ],
    palette: { k: K, r: "#b5503c", b: "#e7d5b4" },
  },

  alert: {
    rows: [
      "...kkkkkk...",
      "..kaaaaaak..",
      ".kaaakkaaak.",
      "kaaaakkaaaak",
      "kaaaakkaaaak",
      "kaaaakkaaaak",
      "kaaaakkaaaak",
      "kaaaaaaaaaak",
      "kaaaakkaaaak",
      ".kaaakkaaak.",
      "..kaaaaaak..",
      "...kkkkkk...",
    ],
    palette: { k: K, a: "#e0a03c" },
  },

  cloud: {
    rows: [
      "............",
      "............",
      "....kkkk....",
      "..kkcccckk..",
      ".kcccccccck.",
      "kcccccccccck",
      "kcccccccccck",
      ".kkcccccckk.",
      "...kkkkkk...",
      "............",
      "............",
      "............",
    ],
    palette: { k: K, c: "#dfe7ee" },
  },
} satisfies Record<string, Art>;

export type IconName = keyof typeof ICONS;

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

export const BARN: Art = {
  rows: [
    "........kkkk........",
    "......kkrrrrkk......",
    "....kkrrrrrrrrkk....",
    "..kkrrrrrrrrrrrrkk..",
    ".krrrrrrrrrrrrrrrrk.",
    ".krrrrrrrrrrrrrrrrk.",
    "kkkkkkkkkkkkkkkkkkkk",
    "krrrrrrrrrrrrrrrrrrk",
    "krrwwwrrrrrrrrwwwrrk",
    "krrwwwrrkkkkrrwwwrrk",
    "krrrrrrkwwwwkrrrrrrk",
    "krrrrrrkwwwwkrrrrrrk",
    "krrrrrrkwwwwkrrrrrrk",
    "krrrrrrkwwwwkrrrrrrk",
    "kkkkkkkkkkkkkkkkkkkk",
  ],
  palette: { k: K, r: "#b5503c", w: "#f2e3c8" },
};

export const TREE: Art = {
  rows: [
    ".....kkkkk......",
    "...kkgggggkk....",
    "..kggglgggggk...",
    ".kgglllggggggk..",
    ".kglllllgglggk..",
    "kggllllggglllgk.",
    "kglllllggggllgk.",
    "kgglllgggggggk..",
    ".kggggggglggk...",
    "..kkgggggggk....",
    "....kkgggkk.....",
    "......ktbk......",
    "......ktbk......",
    ".....kttbk......",
    ".....ktttbk.....",
  ],
  palette: { k: K, g: "#4e8a3c", l: "#74b356", t: "#7a5230", b: "#5c3d22" },
};

export const CLOUD: Art = {
  rows: [
    "...wwwww......",
    ".wwwwwwwww....",
    "wwwwwwwwwwwww.",
    ".wwwwwwwwwww..",
  ],
  palette: { w: "#ffffff" },
};

/** One tileable panel of post-and-rail. The scene repeats it along the yard. */
export const FENCE: Art = {
  rows: [
    "w......w",
    "wwwwwwww",
    "w......w",
    "wwwwwwww",
    "w......w",
    "v......v",
  ],
  palette: WOOD,
};

/** Filler for the bits of field nothing has been built on yet. */
export const TUFT: Art = {
  rows: ["g..g..g", ".g.g.g.", ".ggggg."],
  palette: { g: "#548f3e" },
};

export const FLOWERS: Art = {
  rows: [".r...w...p.", "rrr.www.ppp", ".r.g.w.g.p.", ".g.g.g.g.g."],
  palette: { g: "#548f3e", r: "#e06a7c", w: "#f6f1dc", p: "#c98add" },
};

/** A single potato plant. The plot tier is drawn as rows of these. */
export const PLANT: Art = {
  rows: [
    "..g.g..",
    ".ggggg.",
    "gglllgg",
    ".ggggg.",
    "..gsg..",
    ".ddddd.",
  ],
  palette: { g: "#4e8a3c", l: "#74b356", s: "#3e6b2e", d: "#8a5f3f" },
};

const WITHERED = new Map<Art, Art>();

/**
 * The same crop, gone dry. Keyed off whichever mark of the plot is planted, so
 * a tired upgraded bed still reads as an upgraded bed — it's the colour that
 * goes, not the plant.
 */
export function withered(art: Art): Art {
  const hit = WITHERED.get(art);
  if (hit) return hit;
  const dried: Art = {
    rows: art.rows,
    palette: { ...art.palette, g: "#8d8a3a", l: "#a89b46", s: "#6b6428", w: "#d6cdb0" },
  };
  WITHERED.set(art, dried);
  return dried;
}

const FLIPPED = new Map<Art, Art>();

/**
 * The same thing, upside down.
 *
 * Done as a row reversal on the char grid rather than a flipped blit, because
 * the scene's rendering rule forbids transforms on sprites — `ctx.scale(1, -1)`
 * puts the art half a pixel off the buffer's grid and 1px outlines double or
 * vanish. Reversing the rows produces a genuinely inverted sprite that still
 * paints on integer coordinates.
 */
export function flipped(art: Art): Art {
  const hit = FLIPPED.get(art);
  if (hit) return hit;
  const upside: Art = { rows: [...art.rows].reverse(), palette: art.palette };
  FLIPPED.set(art, upside);
  return upside;
}

const CROP_STAGES = new Map<Art, Art[]>();

/**
 * A bed part-grown: four stages from just-planted to ready to lift.
 *
 * Derived from whichever mark is planted rather than authored four times over,
 * so an upgraded bed still grows through the same cycle in its own silhouette
 * and adding a fourth plot mark doesn't mean drawing three more pictures.
 *
 * The early stages are the *bottom* slice of the full plant, which only reads
 * as growth if the caller bottom-aligns them — a crop that grows downward out
 * of the air is worse than no crop cycle at all.
 */
export function cropStages(art: Art): readonly Art[] {
  const hit = CROP_STAGES.get(art);
  if (hit) return hit;

  const rows = art.rows;
  const n = rows.length;
  const slice = (from: number): Art => ({ rows: rows.slice(from), palette: art.palette });

  // Ripe: potatoes showing through the soil at the base. Every other filled
  // pixel of the bottom row, so it reads as lumps rather than a stripe.
  const base = rows[n - 1] ?? "";
  const lifted = [...base].map((c, i) => (c !== "." && i % 2 === 1 ? "o" : c)).join("");
  const ripe: Art = {
    rows: [...rows.slice(0, n - 1), lifted],
    palette: { ...art.palette, o: "#c98b4b" },
  };

  const stages = [slice(n - 3), slice(Math.max(1, Math.floor(n * 0.4))), art, ripe];
  CROP_STAGES.set(art, stages);
  return stages;
}

// ---------------------------------------------------------------------------
// The hoard — what a pile of potatoes turns into as it stops being a pile
// ---------------------------------------------------------------------------

/**
 * The potato itself, everywhere it appears loose: carried, dug, heaped, and
 * riding down the pipeline.
 *
 * Outlined, which is the whole point. Without one it was a soft blob, and a
 * queue of soft blobs in a pipe is a tan line with lumps in it — you can't see
 * how many are going past, which is the one thing the pipeline is for.
 */
export const POTATO_SPRITE: Art = {
  rows: [
    ".kkkk..",
    "klllpk.",
    "kllppdk",
    ".kppddk",
    "..kkkk.",
  ],
  palette: { k: K, ...POTATO },
};

export const SACK: Art = {
  rows: [
    "...ppppp...",
    "...kkkkk...",
    "..kbbbbbk..",
    "..kbbbbbk..",
    ".kbbllbbbk.",
    ".kblllbbbk.",
    "kbbllbbbbbk",
    "kbbbbbbbbbk",
    "kbbbbbbbbbk",
    "kbbbbbbbbbk",
    "kbbbbbbbbbk",
    ".kbbbbbbbk.",
    "..kkkkkkk..",
  ],
  palette: { k: K, b: "#b98a52", l: "#d6ab73", p: "#c98b4b" },
};

export const CRATE: Art = {
  rows: [
    "..pp.pp.pp.pp..",
    ".pp.pp.pp.pp.p.",
    "kkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwk",
    "kwvvwwwwwwvvwwk",
    "kwwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwk",
    "kwwvvwwwwvvwwwk",
    "kwwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkkk",
  ],
  palette: { k: K, w: "#a97a52", v: "#7a5237", p: "#c98b4b" },
};

/**
 * Silo and hydroponic tower are the only two props tall enough that writing
 * their body out row by row would be more typo than art, so their repeating
 * middles are generated. The caps and bases stay hand-authored.
 */
function stack(cap: string[], body: string[], reps: number, base: string[]): string[] {
  const rows = [...cap];
  for (let i = 0; i < reps; i++) rows.push(...body);
  rows.push(...base);
  return rows;
}

/**
 * The yard's silo is deliberately squat: it has to stand in a band about twenty
 * pixels deep next to crates and sacks, and a true-height grain silo would eat
 * the field above it.
 */
export const SILO: Art = {
  rows: stack(
    [
      "....kkkkk....",
      "..kkmmmmmkk..",
      ".kmmmmmmmmmk.",
      "kmmmmmmmmmmmk",
      "kkkkkkkkkkkkk",
    ],
    ["kmmsmmmmmmmmk", "kmmsmmmmmmmmk", "kmmsmmmmmmmmk", "kkkkkkkkkkkkk"],
    3,
    ["kmmsmmmmmmmmk", "kmmsmmmmmmmmk", "kkkkkkkkkkkkk"],
  ),
  palette: { k: K, ...METAL },
};

/**
 * A barrow of potatoes: the first thing in the yard that isn't just potatoes,
 * and the first hint that this is becoming an operation.
 */
export const BARROW: Art = {
  rows: [
    "....pp.pp....",
    "..ppplpppdp..",
    ".kkkkkkkkkkk.",
    ".kwwwwwwwwwk.",
    ".kwvwwwwwvwk.",
    ".kwwwwwwwwwk.",
    ".kkkkkkkkkkk.",
    "..k.......k..",
    ".kkk.....kkk.",
    "kkvkk...kkvkk",
    ".kkk.....kkk.",
  ],
  palette: { k: K, ...POTATO, ...WOOD },
};

/** A storage shed. Wide and low, so it reads as a step up from a crate. */
export const SHED: Art = {
  rows: [
    "....kkkkkkkkkkkkkkkkkkk....",
    "..kkmmmmmmmmmmmmmmmmmmmkk..",
    ".kmmmmmmmmmmmmmmmmmmmmmmmk.",
    "kmmmmmmmmmmmmmmmmmmmmmmmmmk",
    "kkkkkkkkkkkkkkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwwwwwwwwwwwwwk",
    "kwvwwwwwwwwwwwwwwwwwwwwwvwk",
    "kwwwwwwwwwwwwwwwwwwwwwwwwwk",
    "kwwkkkkkkkkkkkkkkkkkkkkkwwk",
    "kwwkvvvvvvvvvvvvvvvvvvvkwwk",
    "kwwkvvvvvvvvvvvvvvvvvvvkwwk",
    "kwwkvvvvvvvvvvvvvvvvvvvkwwk",
    "kwwkvvvvvvvvvvvvvvvvvvvkwwk",
    "kwwkvvvvvvvvvvvvvvvvvvvkwwk",
    "kkkkkkkkkkkkkkkkkkkkkkkkkkk",
  ],
  palette: { k: K, ...METAL, ...WOOD },
};

/**
 * A grain elevator, and the tallest thing you will ever own. Deliberately
 * taller than the yard is deep — the last few rungs of the build-out have to
 * clear the fence line or there's nothing left to be impressed by.
 */
export const ELEVATOR: Art = {
  rows: stack(
    [
      "......kkkkkkk......",
      "....kkmmmmmmmkk....",
      "...kmmmmmmmmmmmk...",
      "...kmmsmmmmmmmmk...",
      "...kkkkkkkkkkkkk...",
      "..kmmmmmmmmmmmmmk..",
      ".kmmmmmmmmmmmmmmmk.",
      "kmmmmmmmmmmmmmmmmmk",
      "kkkkkkkkkkkkkkkkkkk",
    ],
    ["kmmsmmmmmmmmmmmsmmk", "kmmsmmmmmmmmmmmsmmk", "kmmsmmmmmmmmmmmsmmk", "kkkkkkkkkkkkkkkkkkk"],
    4,
    ["kmmsmmmmmmmmmmmsmmk", "kmmsmmmmmmmmmmmsmmk", "kkkkkkkkkkkkkkkkkkk"],
  ),
  palette: { k: K, ...METAL },
};

// ---------------------------------------------------------------------------
// Producers — one silhouette per rung of the ladder
// ---------------------------------------------------------------------------

export const FARMHAND: Art = {
  rows: [
    "..ttt..",
    ".ttttt.",
    "..fff..",
    "..fef..",
    "..fff..",
    ".bbbbb.",
    "bbbbbbb",
    ".bbbbb.",
    ".b...b.",
    ".v...v.",
    ".k...k.",
  ],
  palette: { k: K, t: "#c9a24a", f: "#e8bb8e", e: K, b: "#4a7fa5", v: "#5e3e29" },
};

export const SPRINKLER: Art = {
  rows: [
    "....a..a.....",
    "..a...a...a..",
    ".a..mmmmm..a.",
    "....mmmmm....",
    "......m......",
    "......m......",
    "......m......",
    "......m......",
    "....kkkkk....",
    "...kkkkkkk...",
  ],
  palette: { k: K, m: "#a8b0b8", a: "#8ec9e6" },
};

export const TRACTOR: Art = {
  rows: [
    "...kkkkkk.........",
    "..kbbbbbbk........",
    "..kbggggbk........",
    "..kbggggbk........",
    "kkkbbbbbbkkkkkkk..",
    "kbbbbbbbbbbbbbbk..",
    "kbbbbbbbbbbbbbbk..",
    "kkkkkkkkkkkkkkkk..",
    ".kwwwwk...kwwk....",
    "kwwwwwwk.kwwwwk...",
    "kwwwwwwk.kwwwwk...",
    ".kwwwwk...kwwk....",
  ],
  palette: { k: K, b: "#4f8f3a", g: "#bfe3ef", w: "#4d4148" },
};

export const COMBINE: Art = {
  rows: [
    "........kkkkkkk.........",
    ".......kbbbbbbbk........",
    ".......kbggggbbk........",
    "kkkk...kbbbbbbbk........",
    "kyyk..kkbbbbbbbkkkkkk...",
    "kyyk.kbbbbbbbbbbbbbbk...",
    "kyykkkbbbbbbbbbbbbbbk...",
    "kyykkkbbbbbbbbbbbbbbk...",
    "kyykkkkkkkkkkkkkkkkkk...",
    "kkkk..kwwwwwwk..kwwk....",
    "......kwwwwwwk..kwwk....",
    ".....kkwwwwwwkk.kwwk....",
    ".....kwwwwwwwwk.kwwk....",
    "......kwwwwwwk...kk.....",
  ],
  palette: { k: K, b: "#c93f34", y: "#c9a24a", g: "#bfe3ef", w: "#4d4148" },
};

export const LAB: Art = {
  rows: [
    "......kkkk........",
    "....kkggggkk......",
    "...kggggggggk.....",
    "...kggggggggk.....",
    "kkkkkkkkkkkkkkkk..",
    "kwwwwwwwwwwwwwwk..",
    "kwggwwwggwwwggwk..",
    "kwggwwwggwwwggwk..",
    "kwwwwwwwwwwwwwwk..",
    "kwwwwwwwwwwwwwwk..",
    "kwwwwwkkkkwwwwwk..",
    "kwwwwwkddkwwwwwk..",
    "kwwwwwkddkwwwwwk..",
    "kkkkkkkkkkkkkkkk..",
  ],
  palette: { k: K, w: "#e7e2d4", g: "#7fd0e0", d: "#7a5237" },
};

export const REFINERY: Art = {
  rows: [
    "...........kkk......",
    "...........kgk......",
    "..kkkkkk...kgk......",
    ".kmmmmmmk..kgk......",
    ".kmmmmmmk..kgk..kkk.",
    ".kmmmmmmk..kgk.kmmk.",
    ".kmmmmmmkkkkgkkkmmk.",
    ".kmmmmmmkmmmgmmmmmk.",
    ".kmmmmmmkmmmmmmmmmk.",
    ".kmmmmmmkmmmmmmmmmk.",
    ".kkkkkkkkkkkkkkkkkk.",
  ],
  palette: { k: K, m: "#a8b0b8", g: "#7f8891" },
};

export const TOWER: Art = {
  rows: stack(
    [
      "..kkkkkkkk..",
      ".kmmmmmmmmk.",
      "kmmmmmmmmmmk",
      "kkkkkkkkkkkk",
    ],
    ["kmggmmggmmmk", "kmggmmggmmmk", "kkkkkkkkkkkk"],
    6,
    ["kmmmmmmmmmmk", "kmmmmmmmmmmk", "kkkkkkkkkkkk"],
  ),
  palette: { k: K, m: "#cfd6dc", g: "#6dc45a" },
};

export const SEEDER: Art = {
  rows: [
    "....kkkkkk....",
    "..kkcccccckk..",
    ".kcccccccccck.",
    "kcccccccccccck",
    ".kcccccccccck.",
    "..kkcccccckk..",
    "....kmmmmk....",
    ".....aaaa.....",
  ],
  palette: { k: K, c: "#dfe7ee", m: "#a8b0b8", a: "#8ec9e6" },
};

/**
 * A cooling tower, and it should look like one from across the room: an open
 * mouth with the dark of the shaft showing in it, a waist, a lit core behind
 * the throat, a hazard band round the bottom and vents at the foot. The old one
 * was the same hourglass with a grey square in the middle, which at fourteen
 * pixels across read as a chess piece.
 */
export const REACTOR: Art = {
  rows: [
    "..kkkkkkkkkk..",
    ".kkddddddddkk.",
    ".kmmmmmmmmmmk.",
    "..kmmmmmmmmk..",
    "...kmmmmmmk...",
    "...kmggggmk...",
    "...kmggggmk...",
    "...kmmmmmmk...",
    "..kmmmmmmmmk..",
    "..kmmmmmmmmk..",
    ".kmmmmmmmmmmk.",
    ".khhhhhhhhhhk.",
    "kkmmmmmmmmmmkk",
    "kmkkmmmmmmkkmk",
    "kkkkkkkkkkkkkk",
  ],
  palette: { k: K, m: "#cfd6dc", d: "#6b737c", e: "#8d959d", g: "#7fe8cc", h: "#e8b93f" },
};

export const SATELLITE: Art = {
  rows: [
    "......kkkk......",
    ".....kggggk.....",
    "kkkk.kggggk.kkkk",
    "kbbkkkggggkkkbbk",
    "kbbk.kggggk.kbbk",
    "kkkk.kggggk.kkkk",
    ".....kggggk.....",
    "......kkkk......",
  ],
  palette: { k: K, b: "#4a7fa5", g: "#8cd66a" },
};

export const SINGULARITY: Art = {
  rows: [
    "....pppppp....",
    "..pp......pp..",
    ".p...vvvv...p.",
    "p..vv....vv..p",
    "p.v...nn...v.p",
    "pv..nnnnnn..vp",
    "pv.nnnnnnnn.vp",
    "pv.nnnnnnnn.vp",
    "pv..nnnnnn..vp",
    "p.v...nn...v.p",
    "p..vv....vv..p",
    ".p...vvvv...p.",
    "..pp......pp..",
    "....pppppp....",
  ],
  palette: { p: "#8a6ad0", v: "#5b3fa0", n: "#1c1428" },
};

// ---------------------------------------------------------------------------
// Marks — what a producer looks like once you've bought its upgrades
// ---------------------------------------------------------------------------
//
// Every tier has exactly two `producer_mult` upgrades (`<id>_x2a`, `<id>_x2b`),
// so each one gets three marks: as bought, then one per upgrade. Spending on a
// tier should change something out in the field, not just a number in a panel.
//
// Where the silhouette can carry the change it does — an exhaust stack, an
// unloading auger, a second sprinkler boom, a taller tower — because that reads
// at a glance across the whole field. Where the thing is small or far away (the
// sky tiers, the buildings on the back edge) the mark is a repaint, which is
// all that survives at that size anyway.

/** The same grid in a different finish. */
function repaint(art: Art, palette: Record<string, string>): Art {
  return { rows: art.rows, palette: { ...art.palette, ...palette } };
}

const PLANT_2: Art = {
  rows: [
    "..g.g.g..",
    ".gglglgg.",
    "gglllllgg",
    "gglllllgg",
    ".ggglggg.",
    "..gsssg..",
    ".ddddddd.",
  ],
  palette: PLANT.palette,
};

/** Potatoes really do flower, and it's the clearest "this bed is doing well". */
const PLANT_3: Art = {
  rows: [
    "..w.w.w..",
    "..gwgwg..",
    ".gglglgg.",
    "gglllllgg",
    "gglllllgg",
    ".ggglggg.",
    "..gsssg..",
    ".ddddddd.",
  ],
  palette: { ...PLANT.palette, w: "#efe4f6" },
};

const SPRINKLER_2: Art = {
  rows: [
    "...a.a.a.a.a...",
    ".a...a...a...a.",
    "a..mmmmmmmmm..a",
    "...mmmmmmmmm...",
    ".......m.......",
    ".......m.......",
    ".......m.......",
    ".......m.......",
    ".....kkkkk.....",
    "....kkkkkkk....",
  ],
  palette: SPRINKLER.palette,
};

const SPRINKLER_3: Art = {
  rows: [
    "...a.a.a.a.a...",
    ".a...a...a...a.",
    "a..mmmmmmmmm..a",
    "...mmmmmmmmm...",
    "..mm...m...mm..",
    "...m...m...m...",
    "...m...m...m...",
    ".......m.......",
    ".....kkkkk.....",
    "....kkkkkkk....",
  ],
  palette: SPRINKLER.palette,
};

/** Turbo Diesel: the stack is the whole joke, so it goes on the roof. */
const TRACTOR_2: Art = {
  rows: [
    ".......k..........",
    ".......k..........",
    "...kkkkkkk........",
    "..kbbbbbbk........",
    "..kbggggbk........",
    "..kbggggbk........",
    "kkkbbbbbbkkkkkkk..",
    "kbbbbbbbbbbbbbbk..",
    "kbbbbbbbbbbbbbbk..",
    "kkkkkkkkkkkkkkkk..",
    ".kwwwwk...kwwk....",
    "kwwwwwwk.kwwwwk...",
    "kwwwwwwk.kwwwwk...",
    ".kwwwwk...kwwk....",
  ],
  palette: TRACTOR.palette,
};

/** Autosteer: a beacon on the roof, and the paint job of something expensive. */
const TRACTOR_3: Art = {
  rows: [
    ".......k..........",
    ".....y.k..........",
    "...kkkkkkk........",
    "..kbbbbbbk........",
    "..kbggggbk........",
    "..kbggggbk........",
    "kkkbbbbbbkkkkkkk..",
    "kbbbbbbbbbbbbbbk..",
    "kbbbbbbbbbbbbbbk..",
    "kkkkkkkkkkkkkkkk..",
    ".kwwwwk...kwwk....",
    "kwwwwwwk.kwwwwk...",
    "kwwwwwwk.kwwwwk...",
    ".kwwwwk...kwwk....",
  ],
  palette: { ...TRACTOR.palette, b: "#c99a34", y: "#e05a3c" },
};

/** Wider Header: the unloading auger swung out over the field. */
const COMBINE_2: Art = {
  rows: [
    "..................kkkk..",
    "................kkkkk...",
    "........kkkkkkkkkk......",
    ".......kbbbbbbbk........",
    ".......kbggggbbk........",
    "kkkk...kbbbbbbbk........",
    "kyyk..kkbbbbbbbkkkkkk...",
    "kyyk.kbbbbbbbbbbbbbbk...",
    "kyykkkbbbbbbbbbbbbbbk...",
    "kyykkkbbbbbbbbbbbbbbk...",
    "kyykkkkkkkkkkkkkkkkkk...",
    "kkkk..kwwwwwwk..kwwk....",
    "......kwwwwwwk..kwwk....",
    ".....kkwwwwwwkk.kwwk....",
    ".....kwwwwwwwwk.kwwk....",
    "......kwwwwwwk...kk.....",
  ],
  palette: COMBINE.palette,
};

/** Night Shift Cab: work lights, on at any hour. */
const COMBINE_3: Art = {
  rows: [
    "..................kkkk..",
    "................kkkkk...",
    "......llkkkkkkkkkk......",
    ".......kbbbbbbbk........",
    ".......kbggggbbk........",
    "kkkk...kbbbbbbbk........",
    "kyyk..kkbbbbbbbkkkkkk...",
    "kyyk.kbbbbbbbbbbbbbbk...",
    "kyykkkbbbbbbbbbbbbbbk...",
    "kyykkkbbbbbbbbbbbbbbk...",
    "kyykkkkkkkkkkkkkkkkkk...",
    "kkkk..kwwwwwwk..kwwk....",
    "......kwwwwwwk..kwwk....",
    ".....kkwwwwwwkk.kwwk....",
    ".....kwwwwwwwwk.kwwk....",
    "......kwwwwwwk...kk.....",
  ],
  palette: { ...COMBINE.palette, l: "#ffe08a" },
};

/** Catalytic Cracking, then Continuous Flow: the flare stack gets serious. */
const REFINERY_2: Art = {
  rows: [
    "...........f........",
    "..........fff.......",
    "...........kgk......",
    "..kkkkkk...kgk......",
    ".kmmmmmmk..kgk......",
    ".kmmmmmmk..kgk..kkk.",
    ".kmmmmmmk..kgk.kmmk.",
    ".kmmmmmmkkkkgkkkmmk.",
    ".kmmmmmmkmmmgmmmmmk.",
    ".kmmmmmmkmmmmmmmmmk.",
    ".kmmmmmmkmmmmmmmmmk.",
    ".kkkkkkkkkkkkkkkkkk.",
  ],
  palette: { ...REFINERY.palette, f: "#f0913c" },
};

const REFINERY_3: Art = {
  rows: [
    "..........fff.......",
    ".........fbbbf......",
    "..........fff.......",
    "...........kgk......",
    "..kkkkkk...kgk......",
    ".kmmmmmmk..kgk......",
    ".kmmmmmmk..kgk..kkk.",
    ".kmmmmmmk..kgk.kmmk.",
    ".kmmmmmmkkkkgkkkmmk.",
    ".kmmmmmmkmmmgmmmmmk.",
    ".kmmmmmmkmmmmmmmmmk.",
    ".kmmmmmmkmmmmmmmmmk.",
    ".kkkkkkkkkkkkkkkkkk.",
  ],
  palette: { ...REFINERY.palette, f: "#f0913c", b: "#ffe08a" },
};

/** Full Spectrum LEDs, then Nutrient Telemetry: more lit floors, then more floors. */
function tower(reps: number, palette: Record<string, string>): Art {
  return {
    rows: stack(
      ["..kkkkkkkk..", ".kmmmmmmmmk.", "kmmmmmmmmmmk", "kkkkkkkkkkkk"],
      ["kmggmmggmmmk", "kmggmmggmmmk", "kkkkkkkkkkkk"],
      reps,
      ["kmmmmmmmmmmk", "kmmmmmmmmmmk", "kkkkkkkkkkkk"],
    ),
    palette: { k: K, m: "#cfd6dc", ...palette },
  };
}
const TOWER_2 = tower(8, { g: "#8ce06a" });
const TOWER_3 = tower(11, { g: "#a8f07a", m: "#e2e8ee" });

/** Silver Iodide, then a Jet Stream Permit: drizzle, then an actual storm. */
const SEEDER_2: Art = {
  rows: [
    "....kkkkkk....",
    "..kkcccccckk..",
    ".kcccccccccck.",
    "kcccccccccccck",
    ".kcccccccccck.",
    "..kkcccccckk..",
    "....kmmmmk....",
    "...aa.aa.aa...",
    "..a..a..a..a..",
  ],
  palette: { ...SEEDER.palette, c: "#b9c3cc" },
};

const SEEDER_3: Art = {
  rows: [
    "....kkkkkk....",
    "..kkcccccckk..",
    ".kcccccccccck.",
    "kcccccccccccck",
    ".kcccccccccck.",
    "..kkcccccckk..",
    "....kmmmmk....",
    "...aa.zz.aa...",
    "..a...z...a...",
    ".....zz.......",
  ],
  palette: { ...SEEDER.palette, c: "#8f9aa5", z: "#ffe066" },
};

/**
 * Three marks per tier, indexed by how many of its two upgrades you own.
 *
 * The buildings on the back edge and everything in the sky are repaints: at the
 * size they're drawn, a changed silhouette would just read as a different
 * building, and the colour is the only thing that survives.
 */
export const PRODUCER_MARKS = {
  plot: [PLANT, PLANT_2, PLANT_3],
  hand: [
    FARMHAND,
    repaint(FARMHAND, { b: "#e08a3c", t: "#f2e3c8" }),
    repaint(FARMHAND, { b: "#3f8f86", t: "#e0c04a" }),
  ],
  irrigation: [SPRINKLER, SPRINKLER_2, SPRINKLER_3],
  tractor: [TRACTOR, TRACTOR_2, TRACTOR_3],
  harvester: [COMBINE, COMBINE_2, COMBINE_3],
  lab: [LAB, repaint(LAB, { g: "#7fe0a0" }), repaint(LAB, { g: "#c88fe6", w: "#eee8f4" })],
  refinery: [REFINERY, REFINERY_2, REFINERY_3],
  tower: [TOWER, TOWER_2, TOWER_3],
  seeder: [SEEDER, SEEDER_2, SEEDER_3],
  reactor: [
    REACTOR,
    repaint(REACTOR, { g: "#6fd8e6" }),
    repaint(REACTOR, { g: "#ffd166", m: "#e6ecf2" }),
  ],
  orbital: [
    SATELLITE,
    repaint(SATELLITE, { b: "#6fa8dc", g: "#a4e884" }),
    repaint(SATELLITE, { b: "#e0c04a", g: "#c6f5a0" }),
  ],
  singularity: [
    SINGULARITY,
    repaint(SINGULARITY, { p: "#b98ae6", v: "#7a5ac0" }),
    repaint(SINGULARITY, { p: "#e0c04a", v: "#a8792c", n: "#120c1c" }),
  ],
} as const satisfies Record<string, readonly [Art, Art, Art]>;

export type MarkedProducerId = keyof typeof PRODUCER_MARKS;
