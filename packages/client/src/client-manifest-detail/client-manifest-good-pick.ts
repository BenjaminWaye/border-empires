// The Good pick marker shared by the Manifest list, the expanded tree, and the
// detail panel: a gilded band across the top of the card plus a gold frame
// (see client-manifest-detail.css). Kept out of the ember warning colors so it
// never reads like a "missing resource" note.

/** Class added to a card that carries the Good pick band (gold frame). */
export const GOOD_PICK_CARD_CLASS = " good-pick";

/** The band itself; render it as the card's first child. */
export const GOOD_PICK_BAND_HTML = `<span class="manifest-good-pick-band"><span class="manifest-good-pick-band__star" aria-hidden="true">★</span>Good pick</span>`;
