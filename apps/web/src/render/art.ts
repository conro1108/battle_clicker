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

  // The upkeep tab. A spanner rather than a cloud, because the sheet is about
  // what you do to the farm, not what the sky did to it — and past the fold
  // there's no weather to draw anyway.
  wrench: {
    rows: [
      "..kkk.kkk...",
      "..kmk.kmk...",
      "..kmk.kmk...",
      "..kmmmmmk...",
      "...kmmmk....",
      "....kmk.....",
      "....kmk.....",
      "....kmk.....",
      "....kmk.....",
      "...kmmmk....",
      "...kmmmk....",
      "...kkkkk....",
    ],
    palette: { k: K, m: METAL.m },
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

/**
 * The yard light, on its post by the gate.
 *
 * It's here to answer a question the renderer used to just assume. The farm
 * goes dark after eight and the yard doesn't, which is the right call — the
 * hoard is the thing you came back at 2am to look at — but with nothing in the
 * picture throwing that light it read as the bottom of the screen not having
 * got the memo. So: a lamp, off by day, lit at dusk, and the pool it throws is
 * the shape of the half of the yard that *does* go dark.
 */
const LAMP_ROWS = [
  "kkkkk",
  "kgggk",
  "kgggk",
  ".kgk.",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  "..m..",
  ".kmk.",
  "kkmkk",
];

export const LAMP: Art = {
  rows: LAMP_ROWS,
  palette: { k: K, g: "#5e6870", m: "#7f8891" },
};

/** The same post with the light on. */
export const LAMP_ON: Art = {
  rows: LAMP_ROWS,
  palette: { k: K, g: "#ffe9a8", m: "#8b949c" },
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

const SHRUNK = new Map<Art, Art>();

/**
 * The same thing, half the size, for the ranks of the property that stand
 * further back than the near one.
 *
 * Resampled on the char grid rather than by scaling a sprite, because the
 * scene's one hard rule is that nothing gets a fractional transform: a half of
 * the art is a *different picture*, authored here once, and it lands on the
 * buffer's grid like everything else.
 *
 * Each 2x2 block votes, and the most common key in it wins with the top-left
 * breaking ties. Nearest-neighbour — taking every other column — was the first
 * go and it eats the 1px outline off whichever edge lands on an odd column, so
 * half the skyline came out with its right-hand wall missing. A vote keeps the
 * silhouette and lets the body colour through the middle, which is all a
 * building three fields away is: a shape in the right colour.
 */
export function shrunk(art: Art): Art {
  const hit = SHRUNK.get(art);
  if (hit) return hit;

  const w = art.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const rows: string[] = [];
  for (let y = 0; y < art.rows.length; y += 2) {
    let row = "";
    for (let x = 0; x < w; x += 2) {
      const votes = new Map<string, number>();
      let best = ".";
      for (const [dy, dx] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ] as const) {
        const c = art.rows[y + dy]?.[x + dx] ?? ".";
        if (c === "." || !art.palette[c]) continue;
        const n = (votes.get(c) ?? 0) + 1;
        votes.set(c, n);
        if (n > (votes.get(best) ?? 0)) best = c;
      }
      row += best;
    }
    rows.push(row);
  }

  const small: Art = { rows, palette: art.palette };
  SHRUNK.set(art, small);
  return small;
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

/**
 * The Orbital Greenhouse: a pressurised growing module, not a satellite.
 *
 * The old one was a green square between two blue squares, and next to the
 * Cloud Seeder — a proper lens-shaped airship trailing weather — it read as
 * placeholder art on the rung *above* it. The tier is a greenhouse, so it's
 * drawn as one: glazing bars over a lit canopy up top, the crop showing through
 * it, a hull with lit ports under that, and solar wings out to either side. The
 * one thing it must not look like is a machine — everything else in the sky at
 * this point in the ladder is hardware, and this is a garden that happens to be
 * in orbit.
 */
export const GREENHOUSE: Art = {
  rows: [
    ".........kk.........",
    "......kkkkkkkk......",
    ".....kcccccccck.....",
    "....kccckcckccck....",
    "kbbkkggckggkcggkkbbk",
    "kbbkkgggkggkgggkkbbk",
    "kbbkkmmmmmmmmmmkkbbk",
    "kkkkkmymmmmmmymkkkkk",
    "....kmmmmmmmmmmk....",
    ".....kkkkkkkkkk.....",
    "........kmmk........",
  ],
  palette: { k: K, b: "#4a7fa5", c: "#bfe3ef", g: "#6dc45a", m: "#a8b0b8", y: "#ffe08a" },
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
// Above the fold — the four tiers that farm the potato you're inside
// ---------------------------------------------------------------------------
//
// These are drawn against the ceiling's warm ochre rather than against sky and
// grass, so they're cool and hard-edged where everything else on the farm is
// warm: the flesh is the quiet half of the screen and a machine on it should be
// the one thing up there that isn't soft.

/**
 * Hangs off the ceiling with its coulters biting *upward*. Everything about a
 * plough says which way is down, so the one drawn upside down is the cheapest
 * way to say the ground is over your head now.
 */
export const FURROW: Art = {
  rows: [
    "m..m..m..m..m",
    "m..m..m..m..m",
    "kkkkkkkkkkkkk",
    "kbbbbbbbbbbbk",
    "kbggbbbbggbbk",
    "kkkkkkkkkkkkk",
    ".kk.......kk.",
    "kwwk.....kwwk",
    ".kk.......kk.",
  ],
  palette: { k: K, b: "#3f6b74", g: "#ffe08a", m: "#cfd6dc", w: "#4d4148" },
};

/** A wellhead with the shaft running off the bottom of the world. */
export const MANTLE: Art = {
  rows: [
    "...kkkk...",
    "..kmmmmk..",
    "..kmggmk..",
    ".kkmmmmkk.",
    ".kmmmmmmk.",
    "kkmmmmmmkk",
    "km.kkkk.mk",
    "km.khhk.mk",
    "km.khhk.mk",
    "kmmkhhkmmk",
    "kkkkhhkkkk",
    "...khhk...",
    "...khhk...",
    "...khhk...",
  ],
  palette: { k: K, m: "#8d959d", g: "#ffb454", h: "#5b3f2c" },
};

/**
 * One of the other yous. Deliberately the farmhand's exact silhouette in a
 * different finish — the joke doesn't survive being redrawn as something else,
 * and at eleven pixels tall a changed shape would just read as a new tier of
 * worker rather than as you.
 */
export const CHORUS_FIGURE: Art = {
  rows: [
    "...a...",
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
  palette: {
    k: "#6a5c7a",
    a: "#e6dcef",
    t: "#b9a8cc",
    f: "#d8cde4",
    e: "#4a3f5c",
    b: "#8f7fb0",
    v: "#6a5c7a",
  },
};

/**
 * An eye, opened. The one thing on the inside farm that is unambiguously alive
 * and unambiguously the potato's rather than yours — every other rung down here
 * is kit you brought with you.
 */
export const EYE: Art = {
  rows: [
    "...ss.s...",
    "..sksks...",
    "...ksk....",
    ".kkkkkkkk.",
    "khhhhhhhhk",
    "khhwwwwhhk",
    "khwwiiwwhk",
    "khwwinwwhk",
    "khhwwwwhhk",
    "khhhhhhhhk",
    ".kkkkkkkk.",
    "..k....k..",
  ],
  palette: { k: K, h: "#a8703c", w: "#e8d3a0", i: "#6f4a8f", n: "#241830", s: "#7fc45a" },
};

/**
 * A cut face of starch with the plant working it. Wide and low: it's a quarry,
 * so it's the one thing down here that reads as ground rather than as a
 * structure standing on it.
 */
export const STARCH_SEAM: Art = {
  rows: [
    "......kkkkkk....",
    "....kkwwwwwwkk..",
    "..kkwwwwwwwwwwk.",
    ".kwwwwwwwwwwwwwk",
    "kwwsswwwwwsswwwk",
    "kwwwwwwwwwwwwwwk",
    "kwwwwkkkkwwwwwwk",
    "kwwwwkddkwwwwwwk",
    "kkkkkkddkkkkkkkk",
  ],
  palette: { k: K, w: "#e6dcc0", s: "#f7f1dc", d: "#2c1d14" },
};

/**
 * A tapped vein. The clamp is the machine; everything else in the sprite is the
 * potato's own plumbing, which is why it's the only rung drawn in a colour that
 * isn't in any other sprite on the farm.
 */
export const PHLOEM_VEIN: Art = {
  rows: [
    "..kvvk....",
    "..kvvk....",
    ".kkvvkk...",
    "kmmmmmmk..",
    "kmsggsmk..",
    "kmmmmmmk..",
    ".kkvvkk...",
    "..kvvkk...",
    "...kvvk...",
    "...kvvk...",
    "..kkvvkk..",
    "..kvvvvk..",
    "...kkkk...",
  ],
  palette: { k: K, v: "#8f5e8a", m: "#8d959d", s: "#5f6870", g: "#e0a8dc" },
};

/**
 * A door cut in the inside of the skin, propped open. What you can see through
 * it is more flesh, which is the joke and the reason the opening is drawn in the
 * ceiling's own ochre rather than as darkness.
 */
export const PERIDERM_GATE: Art = {
  rows: [
    "kkkkkkkkkkkkkk",
    "kddddddddddddk",
    "kdkkkkkkkkkkdk",
    "kdkffffffffkdk",
    "kdkfffllfffkdk",
    "kdkfflllfffkdk",
    "kdkffllffffkdk",
    "kdkfffffffkkdk",
    "kdkffffffffkdk",
    "kdkffffffffkdk",
    "kdkkkkkkkkkkdk",
    "kddddddddddddk",
    "kkkkkkkkkkkkkk",
  ],
  palette: { k: K, d: "#6b4630", f: "#c9a05c", l: "#ecd9a6" },
};

/** The last rung, hanging where the sun was. It has eyes. */
export const SECOND_POTATO: Art = {
  rows: [
    "....kkkkkkk.....",
    "..kkpppppppkk...",
    ".kpplppppppppk..",
    "kplllppppppdppk.",
    "kpllppppppdddppk",
    "kppppppppppddppk",
    "kpppppdppppppppk",
    "kppppdddpppppppk",
    "kpppppdpppplpppk",
    "kppppppppplllppk",
    ".kpppdppppplppk.",
    "..kkppdppppkkk..",
    "....kkkkkkk.....",
  ],
  palette: { k: K, p: "#c98b4b", l: "#e2b077", d: "#7a4a24" },
};

// ---------------------------------------------------------------------------
// Marks — what a producer looks like once you've bought its upgrades
// ---------------------------------------------------------------------------
//
// Every tier has three `producer_mult` upgrades (`<id>_x2a`, `<id>_x2b`,
// `<id>_x2c`), so each one gets four marks: as bought, then one per upgrade.
// Spending on a tier should change something out in the field, not just a number
// in a panel.
//
// Where the silhouette can carry the change it does — an exhaust stack, an
// unloading auger, a second sprinkler boom, a taller tower — because that reads
// at a glance across the whole field. For the first two upgrades on the small or
// distant tiers (the sky, the buildings on the back edge) the mark is a repaint,
// which is all that survives at that size anyway.
//
// **The fourth mark is the exception, and it's the whole point of it.** It's
// gated on owning a hundred, which is a day of deliberately aiming at one rung,
// so every one of them is redrawn rather than repainted — even the ones two
// fields away. A player who put a day into farmhands should be able to tell from
// across the room that their farmhands are not your farmhands.

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

// ---------------------------------------------------------------------------
// The fourth marks — what a hundred of something turns into
// ---------------------------------------------------------------------------

/** Heirloom Strain: it flowers, it sprawls, and the crop breaks the surface. */
const PLANT_4: Art = {
  rows: [
    "..w.w.w.w..",
    ".wgwgwgwgw.",
    ".gglglglgg.",
    "gglllllllgg",
    "gglllllllgg",
    ".gggglgggg.",
    "..ggsssgg..",
    ".ddddddddd.",
    "..dpddpdd..",
  ],
  palette: { ...PLANT.palette, w: "#efe4f6", p: "#c98b4b" },
};

/** Equity Stake: a hat, a good coat, and gold on the lapels. Part owner. */
const FARMHAND_4: Art = {
  rows: [
    "...ttt...",
    ".ttttttt.",
    "...fff...",
    "...fef...",
    "...fff...",
    "..bbbbb..",
    ".bbabbab.",
    "bbbbabbbb",
    ".bbbbbbb.",
    "..b...b..",
    "..v...v..",
    "..k...k..",
  ],
  palette: { k: K, t: "#e0c04a", f: "#e8bb8e", e: K, b: "#2f5f7a", v: "#5e3e29", a: "#e0c04a" },
};

/**
 * Centre Pivot: the thing that actually waters a field this size. A boom on a
 * tower with drop tubes down its whole length, which is the one irrigation
 * silhouette that reads as *industrial* rather than as a garden sprinkler.
 */
const SPRINKLER_4: Art = {
  rows: [
    ".........m.........",
    "kmmmmmmmmmmmmmmmmmk",
    ".m..m..m.m.m..m..m.",
    ".a..a..a.m.a..a..a.",
    "a.a.a.a.ama.a.a.a.a",
    ".a.a.a.a.m.a.a.a.a.",
    ".........m.........",
    ".........m.........",
    ".........m.........",
    ".......kkkkk.......",
    "......kkkkkkk......",
  ],
  palette: SPRINKLER.palette,
};

/** Tracked Chassis: twin stacks, a beacon, and it runs on tracks now. */
const TRACTOR_4: Art = {
  rows: [
    ".....k.k..........",
    ".....k.k..........",
    "..ykkkkkkk........",
    "..kbbbbbbk........",
    "..kbggggbk........",
    "..kbggggbk........",
    "kkkbbbbbbkkkkkkk..",
    "kbbbbbbbbbbbbbbk..",
    "kbbbbbbbbbbbbbbk..",
    "kkkkkkkkkkkkkkkk..",
    ".kkkkkkkkkkkkkk...",
    "kwwwwwwwwwwwwwwk..",
    "kwkwkwkwkwkwkwwk..",
    "kwwwwwwwwwwwwwwk..",
    ".kkkkkkkkkkkkkk...",
  ],
  // Dark green and not the near-black the first go used: at eighteen pixels a
  // machine with no value range left in its body reads as a burnt-out hulk
  // parked in the field, which is exactly what a broken one is drawn as.
  palette: { ...TRACTOR.palette, b: "#2f6b46", g: "#bfe3ef", y: "#e05a3c", w: "#3a3038" },
};

/** Twin Rotor: a second unloading auger, so it never has to stop to empty. */
const COMBINE_4: Art = {
  rows: [
    "..................kkkk..",
    "................kkkkk...",
    "......llkkkkkkkkkk......",
    ".......kbbbbbbbk...kkkk.",
    ".......kbggggbbk.kkk....",
    "kkkk...kbbbbbbbkkk......",
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
  palette: { ...COMBINE.palette, b: "#8f2a22", y: "#e0c04a", l: "#ffe08a" },
};

/** The Prize: the dome got bigger and there's a plaque over the door. */
const LAB_4: Art = {
  rows: [
    ".....kkkkkkkk.....",
    "...kkgggggggkk....",
    "..kgggggggggggk...",
    "..kgggggggggggk...",
    "..kgggggggggggk...",
    "kkkkkkkkkkkkkkkk..",
    "kwwwwwwwwwwwwwwk..",
    "kwggwwwggwwwggwk..",
    "kwggwwwggwwwggwk..",
    "kwwwwwwwwwwwwwwk..",
    "kwwwwwwyywwwwwwk..",
    "kwwwwwkkkkwwwwwk..",
    "kwwwwwkddkwwwwwk..",
    "kwwwwwkddkwwwwwk..",
    "kkkkkkkkkkkkkkkk..",
  ],
  palette: { k: K, w: "#f2eee2", g: "#c88fe6", d: "#7a5237", y: "#e0c04a" },
};

/** Cogeneration: a second stack, alight, because nothing is vented any more. */
const REFINERY_4: Art = {
  rows: [
    "...f......fff.......",
    "..fff....fbbbf......",
    "...k......fff.......",
    "...k.......kgk......",
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
  palette: { ...REFINERY.palette, m: "#c6cdd4", f: "#f0913c", b: "#ffe08a", g: "#8d959d" },
};

/**
 * Cloud Deck: taller than anything else on the property, with an observation
 * ring halfway up that overhangs the shaft — the one silhouette on the back edge
 * that isn't a box, and the reason you can pick a hundred-tower lot out of a
 * skyline at a glance.
 */
const TOWER_4: Art = {
  rows: [
    "......kk......",
    "......kk......",
    "...kkkkkkkk...",
    "..kmmmmmmmmk..",
    ".kmmmmmmmmmmk.",
    ".kkkkkkkkkkkk.",
    ...Array.from({ length: 6 }, () => [
      ".kmggmmggmmmk.",
      ".kmggmmggmmmk.",
      ".kkkkkkkkkkkk.",
    ]).flat(),
    "kkkkkkkkkkkkkk",
    "kmmmmmmmmmmmmk",
    "kmyymmyymmyymk",
    "kkkkkkkkkkkkkk",
    ...Array.from({ length: 5 }, () => [
      ".kmggmmggmmmk.",
      ".kmggmmggmmmk.",
      ".kkkkkkkkkkkk.",
    ]).flat(),
    ".kmmmmmmmmmmk.",
    ".kmmmmmmmmmmk.",
    ".kkkkkkkkkkkk.",
  ],
  palette: { k: K, m: "#f0f4f8", g: "#a8f07a", y: "#ffe08a" },
};

/** Eye of the Storm: the hull went the colour of the weather it makes. */
const SEEDER_4: Art = {
  rows: [
    "....kkkkkk....",
    "..kkcccccckk..",
    ".kccczzzcccck.",
    "kcccccccccccck",
    ".kccczzzcccck.",
    "..kkcccccckk..",
    "....kmmmmk....",
    "..aa.azza.aa..",
    ".a..a.zz.a..a.",
    "a..a..z..a..a.",
    "...a.zz.a...a.",
  ],
  palette: { ...SEEDER.palette, c: "#5a6570", z: "#ffe066", a: "#7fb4d8" },
};

/** Ignition: vent stacks up the shoulders and a core that lights the ground. */
const REACTOR_4: Art = {
  rows: [
    "...kkkkkkkkkk...",
    "k.kkddddddddkk.k",
    "m.kmmmmmmmmmmk.m",
    "m..kmmmmmmmmk..m",
    "m...kmmmmmmk...m",
    "m...kmggggmk...m",
    "m...kmggggmk...m",
    "m...kmggggmk...m",
    "m...kmmmmmmk...m",
    "k..kmmmmmmmmk..k",
    "...kmmmmmmmmk...",
    "..kmmmmmmmmmmk..",
    "..khhhhhhhhhhk..",
    ".kkmmmmmmmmmmkk.",
    ".kmkkmmmmmmkkmk.",
    ".kkkkkkkkkkkkkk.",
  ],
  palette: { k: K, m: "#eef4f8", d: "#6b737c", g: "#fff0b8", h: "#e05a3c" },
};

/**
 * Lagrange Station: it stopped being one greenhouse and became the place the
 * greenhouses dock at — a second canopy, a spine between them, and wings big
 * enough to run both.
 */
const GREENHOUSE_4: Art = {
  rows: [
    ".........kk.........",
    "......kkkkkkkk......",
    ".....kcccccccck.....",
    "....kccckcckccck....",
    "kbbkkggckggkcggkkbbk",
    "kbbkkgggkggkgggkkbbk",
    "kbbkkmmmmmmmmmmkkbbk",
    "kbbkkmymmmmmmymkkbbk",
    "kkkkkmmmmmmmmmmkkkkk",
    "....kkkkmmmmkkkk....",
    "....kcccmmmmccck....",
    "....kcggmmmmggck....",
    "....kmmmmmmmmmmk....",
    ".....kkkkkkkkkk.....",
    "........kmmk........",
  ],
  palette: { k: K, b: "#e0c04a", c: "#d8f0f8", g: "#a4e884", m: "#cfd6dc", y: "#fff0b8" },
};

/** Event Horizon Lease: it has a jet now, and the jet points at your farm. */
const SINGULARITY_4: Art = {
  rows: [
    "......pppp......",
    "....pp....pp....",
    "..pp..vvvv..pp..",
    ".p..vv....vv..p.",
    "p..v...nn...v..p",
    "p.v..nnnnnn..v.p",
    "pv..nnnnnnnn..vp",
    "yyyynnnnnnnnyyyy",
    "yyyynnnnnnnnyyyy",
    "pv..nnnnnnnn..vp",
    "p.v..nnnnnn..v.p",
    "p..v...nn...v..p",
    ".p..vv....vv..p.",
    "..pp..vvvv..pp..",
    "....pp....pp....",
    "......pppp......",
  ],
  palette: { p: "#e0c04a", v: "#a8792c", n: "#120c1c", y: "#fff0b8" },
};

/** Second Pass: two gangs and six coulters. It takes the ceiling twice. */
const FURROW_4: Art = {
  rows: [
    "m..m..m..m..m",
    "m..m..m..m..m",
    "kkkkkkkkkkkkk",
    "kbbbbbbbbbbbk",
    "kbggbbbbggbbk",
    "kkkkkkkkkkkkk",
    "kbbbbbbbbbbbk",
    "kbggbbbbggbbk",
    "kkkkkkkkkkkkk",
    ".kk.kk.kk.kk.",
    "kwwkwwkwwkwwk",
    ".kk.kk.kk.kk.",
  ],
  palette: { k: K, b: "#7a5ac0", g: "#ffd166", m: "#e2e8ee", w: "#4d4148" },
};

/** Core Breach: a derrick over the wellhead, and it's venting flame. */
const MANTLE_4: Art = {
  rows: [
    "....gg....",
    "...gkkg...",
    "..k.mm.k..",
    "..km..mk..",
    ".km.gg.mk.",
    ".km.gg.mk.",
    "kmmmmmmmmk",
    "kkmmmmmmkk",
    "km.kkkk.mk",
    "km.khhk.mk",
    "km.khhk.mk",
    "kmmkhhkmmk",
    "kkkkhhkkkk",
    "...khhk...",
    "...khhk...",
    "...khhk...",
    "...khhk...",
  ],
  palette: { k: K, m: "#e2e8ee", g: "#ff9a3c", h: "#c94a2c" },
};

/** All At Once: the same you, lit from inside, with the rest of them behind it. */
const CHORUS_FIGURE_4: Art = {
  rows: [
    "..aaa..",
    ".a...a.",
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
  palette: {
    k: "#8a7a4a",
    a: "#fff4c0",
    t: "#e6d68a",
    f: "#f4ecd0",
    e: "#6a5c3a",
    b: "#d8c060",
    v: "#8a7a4a",
  },
};

/** It Sees the Whole Field: the eye has grown a second pupil, and a sprout. */
const EYE_4: Art = {
  rows: [
    "..s.ss.s.s",
    ".sksksks.s",
    "..sksks...",
    ".kkkkkkkk.",
    "khhhhhhhhk",
    "khwwwwwwhk",
    "kwwinniwwk",
    "kwwinniwwk",
    "khwwwwwwhk",
    "khhhhhhhhk",
    ".kkkkkkkk.",
    "..k....k..",
  ],
  palette: { k: K, h: "#c08a3c", w: "#fff0c8", i: "#e0c04a", n: "#2a1c10", s: "#a8f07a" },
};

/** The Seam Goes Down: the cut face has become a shaft with a headframe. */
const STARCH_SEAM_4: Art = {
  rows: [
    "......kmmk......",
    ".....kmmmmk.....",
    "....km.mm.mk....",
    "...km..mm..mk...",
    "..kkkkkmmkkkkk..",
    ".kwwwwkmmkwwwwk.",
    "kwwsswwmmwwsswwk",
    "kwwwwwwmmwwwwwwk",
    "kwwwwkkmmkkwwwwk",
    "kwwwwkdmmdkwwwwk",
    "kkkkkkdmmdkkkkkk",
  ],
  palette: { k: K, w: "#f4ecd0", s: "#ffffff", d: "#2c1d14", m: "#e2e8ee" },
};

/** The Whole Circulation: three clamps on a vein that has split to feed them. */
const PHLOEM_VEIN_4: Art = {
  rows: [
    "..kvvk....",
    ".kkvvkk...",
    "kmmmmmmk..",
    "kmsggsmk..",
    "kmmmmmmk..",
    ".kvvvvk...",
    "kkvvkkvvk.",
    "kmmk..kmmk",
    "kmgk..kgmk",
    "kmmk..kmmk",
    ".kvk..kvk.",
    ".kvvkkvvk.",
    "..kvvvvk..",
    "...kkkk...",
  ],
  palette: { k: K, v: "#c48ac0", m: "#e2e8ee", s: "#8d959d", g: "#ffd166" },
};

/** The Skin Stops Closing: the door is gone and the hole is lit from outside. */
const PERIDERM_GATE_4: Art = {
  rows: [
    "kkkkkkkkkkkkkk",
    "kmmmmmmmmmmmmk",
    "kmkkkkkkkkkkmk",
    "kmklllllllllmk",
    "kmklloooollkmk",
    "kmkloooooolkmk",
    "kmkloooooolkmk",
    "kmkloooooolkmk",
    "kmklloooollkmk",
    "kmklllllllllmk",
    "kmkkkkkkkkkkmk",
    "kmmmmmmmmmmmmk",
    "kkkkkkkkkkkkkk",
  ],
  palette: { k: K, m: "#e2e8ee", l: "#ecd9a6", o: "#fff4c0" },
};

/** It's Awake: the eyes opened, and it has started to sprout. */
const SECOND_POTATO_4: Art = {
  rows: [
    "....s..s..s.....",
    "....kkkkkkk.....",
    "..kkpppppppkk...",
    ".kpplppppppppk..",
    "kplllpppppooopk.",
    "kpllppppppoyoppk",
    "kpppppppppoooppk",
    "kppppooopppppppk",
    "kppppoyopppppppk",
    "kppppoooppplpppk",
    "kppppppppplllppk",
    ".kpppdppppplppk.",
    "..kkppdppppkkk..",
    "....kkkkkkk.....",
  ],
  palette: {
    k: K,
    p: "#e0c04a",
    l: "#f7e08a",
    d: "#8a6a1c",
    o: "#5a3a10",
    y: "#fff4c0",
    s: "#7fc45a",
  },
};

/**
 * Four marks per tier, indexed by how many of its three upgrades you own.
 *
 * The first two marks of the small and distant tiers are repaints: at the size
 * they're drawn a changed silhouette would just read as a different building.
 * The fourth is always a redraw — see the note above.
 */
export const PRODUCER_MARKS = {
  plot: [PLANT, PLANT_2, PLANT_3, PLANT_4],
  hand: [
    FARMHAND,
    repaint(FARMHAND, { b: "#e08a3c", t: "#f2e3c8" }),
    repaint(FARMHAND, { b: "#3f8f86", t: "#e0c04a" }),
    FARMHAND_4,
  ],
  irrigation: [SPRINKLER, SPRINKLER_2, SPRINKLER_3, SPRINKLER_4],
  tractor: [TRACTOR, TRACTOR_2, TRACTOR_3, TRACTOR_4],
  harvester: [COMBINE, COMBINE_2, COMBINE_3, COMBINE_4],
  lab: [
    LAB,
    repaint(LAB, { g: "#7fe0a0" }),
    repaint(LAB, { g: "#c88fe6", w: "#eee8f4" }),
    LAB_4,
  ],
  refinery: [REFINERY, REFINERY_2, REFINERY_3, REFINERY_4],
  tower: [TOWER, TOWER_2, TOWER_3, TOWER_4],
  seeder: [SEEDER, SEEDER_2, SEEDER_3, SEEDER_4],
  reactor: [
    REACTOR,
    repaint(REACTOR, { g: "#6fd8e6" }),
    repaint(REACTOR, { g: "#ffd166", m: "#e6ecf2" }),
    REACTOR_4,
  ],
  orbital: [
    GREENHOUSE,
    repaint(GREENHOUSE, { b: "#6fa8dc", g: "#a4e884" }),
    repaint(GREENHOUSE, { b: "#e0c04a", g: "#c6f5a0", c: "#d8f0f8" }),
    GREENHOUSE_4,
  ],
  singularity: [
    SINGULARITY,
    repaint(SINGULARITY, { p: "#b98ae6", v: "#7a5ac0" }),
    repaint(SINGULARITY, { p: "#e0c04a", v: "#a8792c", n: "#120c1c" }),
    SINGULARITY_4,
  ],
  furrow: [
    FURROW,
    repaint(FURROW, { b: "#4f8f7a", g: "#b6f2fb" }),
    repaint(FURROW, { b: "#7a5ac0", g: "#ffd166", m: "#e2e8ee" }),
    FURROW_4,
  ],
  mantle: [
    MANTLE,
    repaint(MANTLE, { g: "#ff7a4a", h: "#7a4a24" }),
    repaint(MANTLE, { g: "#ffe08a", m: "#cfd6dc", h: "#8a5a2c" }),
    MANTLE_4,
  ],
  chorus: [
    CHORUS_FIGURE,
    repaint(CHORUS_FIGURE, { b: "#7f9fc0", t: "#a8c0d8", a: "#dceaf4" }),
    repaint(CHORUS_FIGURE, { b: "#c0a86a", t: "#d8c894", a: "#f4ecd0" }),
    CHORUS_FIGURE_4,
  ],
  eyes: [
    EYE,
    repaint(EYE, { i: "#3f8f86", w: "#f2e3c8" }),
    repaint(EYE, { i: "#c94a2c", h: "#c08a3c", w: "#fff0c8" }),
    EYE_4,
  ],
  starch: [
    STARCH_SEAM,
    repaint(STARCH_SEAM, { s: "#ffffff", w: "#efe6cc" }),
    repaint(STARCH_SEAM, { s: "#d8f0f8", w: "#f4ecd0", m: "#cfd6dc" }),
    STARCH_SEAM_4,
  ],
  vein: [
    PHLOEM_VEIN,
    repaint(PHLOEM_VEIN, { v: "#a86ea2", g: "#f0c6ec" }),
    repaint(PHLOEM_VEIN, { v: "#c48ac0", g: "#ffd166", m: "#cfd6dc" }),
    PHLOEM_VEIN_4,
  ],
  skin: [
    PERIDERM_GATE,
    repaint(PERIDERM_GATE, { f: "#d8b070", l: "#f7e8c0" }),
    repaint(PERIDERM_GATE, { d: "#8d959d", f: "#e2b077", l: "#fff4c0" }),
    PERIDERM_GATE_4,
  ],
  second: [
    SECOND_POTATO,
    repaint(SECOND_POTATO, { p: "#d69a58", l: "#f0c68c" }),
    repaint(SECOND_POTATO, { p: "#e0c04a", l: "#f7e08a", d: "#8a6a1c" }),
    SECOND_POTATO_4,
  ],
} as const satisfies Record<string, readonly [Art, Art, Art, Art]>;

export type MarkedProducerId = keyof typeof PRODUCER_MARKS;
