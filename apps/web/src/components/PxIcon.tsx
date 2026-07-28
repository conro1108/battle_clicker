import { ICONS, type IconName } from "../render/art.js";
import { artUrl } from "../render/pixel.js";

/** A pixel-art UI glyph. Sized in CSS px; stays crisp via `image-rendering`. */
export function PxIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <img className="pxicon" src={artUrl(ICONS[name])} width={size} height={size} alt="" />;
}
