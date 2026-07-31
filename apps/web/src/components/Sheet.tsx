import type { ReactNode } from "react";

/**
 * A bottom sheet. Everything that isn't the farm itself lives in one of these,
 * so the scene is never covered by chrome you didn't ask for.
 */
export function Sheet({
  title,
  sub,
  onClose,
  children,
  foot,
  /**
   * The one sheet that isn't furniture. `grave` takes the cream out of it for
   * the last purchase of the run — see `.sheet-grave` in styles.css.
   */
  tone,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
  tone?: "grave";
}) {
  return (
    <div className={`overlay ${tone ? `overlay-${tone}` : ""}`} onClick={onClose}>
      <div className={`sheet ${tone ? `sheet-${tone}` : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {sub && <p className="sheet-sub">{sub}</p>}
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}
