import { solo } from "@battle/sim";

import { PRODUCER_MARKS } from "./render/art.js";
import type { Art } from "./render/pixel.js";

/**
 * How many of a producer's own multiplier upgrades you've bought — which is
 * which mark of the thing is standing out in the field.
 *
 * Counted off the upgrade table's effects rather than the `<id>_x2a` naming
 * convention, so renaming or adding a tier upgrade doesn't quietly stop the art
 * from changing.
 */
export function producerMark(farm: solo.FarmState, id: solo.SoloProducerId): number {
  let level = 0;
  for (const upgrade of solo.SOLO_UPGRADES) {
    const effect = upgrade.effect;
    if (effect.kind !== "producer_mult" || effect.producer !== id) continue;
    if (farm.upgrades.includes(upgrade.id)) level++;
  }
  return level;
}

/** The art for a producer as it currently stands on this farm. */
export function producerArt(farm: solo.FarmState, id: solo.SoloProducerId): Art {
  const marks = PRODUCER_MARKS[id];
  return marks[Math.min(marks.length - 1, producerMark(farm, id))] ?? marks[0];
}

/**
 * What a tier upgrade turns its producer into — the mark *after* the purchase,
 * not the one you already have. That's the pitch: the row is showing you a
 * tractor with an exhaust stack you don't own yet.
 *
 * Upgrades that aren't tied to one producer (global multipliers, dig upgrades)
 * have nothing to show and get no thumbnail.
 */
export function upgradePreview(
  farm: solo.FarmState,
  upgrade: solo.SoloUpgrade,
): Art | undefined {
  const effect = upgrade.effect;
  if (effect.kind !== "producer_mult") return undefined;
  const marks = PRODUCER_MARKS[effect.producer];
  return marks[Math.min(marks.length - 1, producerMark(farm, effect.producer) + 1)];
}
