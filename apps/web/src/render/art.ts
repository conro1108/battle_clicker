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
  potato: {
    rows: [
      "....kkkk....",
      "..kkllppkk..",
      ".klllppppdk.",
      ".kllppppppk.",
      "kllpppdppppk",
      "kllppppppddk",
      "kppppppppddk",
      "kppppdppppdk",
      ".kpppppppdk.",
      ".kppppppddk.",
      "..kkppppkk..",
      "....kkkk....",
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

/** A plant that's given up: the same silhouette, gone dry. */
export const PLANT_TIRED: Art = {
  rows: PLANT.rows,
  palette: { g: "#8d8a3a", l: "#a89b46", s: "#6b6428", d: "#8a5f3f" },
};

// ---------------------------------------------------------------------------
// The hoard — what a pile of potatoes turns into as it stops being a pile
// ---------------------------------------------------------------------------

export const POTATO_SPRITE: Art = {
  rows: [
    "..lll..",
    ".lllpp.",
    "lppppdp",
    ".ppppd.",
    "..ppd..",
  ],
  palette: POTATO,
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
    ".pp.pp.pp.pp..",
    "kkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwk",
    "kwvvwwwwwwvvwk",
    "kwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwk",
    "kwwvvwwwwvvwwk",
    "kwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkk",
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
    4,
    ["kmmsmmmmmmmmk", "kmmsmmmmmmmmk", "kkkkkkkkkkkkk"],
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

export const REACTOR: Art = {
  rows: [
    "..kkkkkkkkkk..",
    ".kmmmmmmmmmmk.",
    ".kmmmmmmmmmmk.",
    "..kmmmmmmmmk..",
    "...kmmmmmmk...",
    "...kmmssmmk...",
    "...kmmssmmk...",
    "...kmmmmmmk...",
    "..kmmmmmmmmk..",
    "..kmmmmmmmmk..",
    ".kmmmmmmmmmmk.",
    ".kmmmmmmmmmmk.",
    "kmmmmmmmmmmmmk",
    "kmmmmmmmmmmmmk",
    "kkkkkkkkkkkkkk",
  ],
  palette: { k: K, m: "#cfd6dc", s: "#7f8891" },
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
