export * from "./numbers.js";
export * from "./rng.js";
export * from "./content.js";
export * from "./state.js";
export * from "./economy.js";
export * from "./combat.js";
export * from "./match.js";
export * from "./bot.js";

/**
 * Namespaced, because solo and versus have their own producers, their own cost
 * curves and their own `clickYield`. Flattening them into one export surface
 * would make it far too easy to price a homestead with match content.
 */
export * as solo from "./solo/index.js";
