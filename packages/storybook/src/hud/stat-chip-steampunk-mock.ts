/**
 * Proposed steampunk skin for the top-HUD stat chips (Player, Coin,
 * Manpower, Empire Integrity, Development), so they match the brass
 * resource pills and the proposed manpower gauge chip.
 * client-steampunk-theme-style.css re-themes #top-strip and .resource-pill
 * but never touched .stat-chip, which is why the chips still use the old
 * translucent-white box and plain serif numbers.
 *
 * Scoped under `.sb-stat-chips-steampunk` so the "Current" strip in the HUD
 * story stays as-is for comparison. To ship, drop the scope and move these
 * rules into the client's steampunk stylesheet.
 */

const STYLES = `
.sb-stat-chips-steampunk .stat-chip {
  border-radius: 4px;
  border: 1px solid var(--sp-brass-700);
  background: linear-gradient(180deg, rgba(60,41,25,0.85), rgba(28,20,12,0.85));
  box-shadow: inset 0 1px 0 rgba(244,223,166,0.08);
  color: var(--sp-parchment-100);
  transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
}
.sb-stat-chips-steampunk button.stat-chip:hover {
  border-color: var(--sp-brass-300);
  box-shadow: inset 0 1px 0 rgba(244,223,166,0.14), 0 0 10px rgba(217,173,82,0.18);
}
.sb-stat-chips-steampunk .stat-chip > span {
  font-family: var(--sp-font-display); font-weight: 600; letter-spacing: 0.12em; color: var(--sp-brass-300);
}
.sb-stat-chips-steampunk .stat-chip > strong {
  font-family: var(--sp-font-mono); font-weight: 700; color: var(--sp-brass-100); text-shadow: 0 1px 0 rgba(0,0,0,0.6);
}
/* The player name is a name, not a reading: keep it in the body serif. */
.sb-stat-chips-steampunk .stat-chip-player > strong { font-family: var(--sp-font-body); font-weight: 600; color: var(--sp-parchment-100); }
.sb-stat-chips-steampunk .stat-chip-rate { font-family: var(--sp-font-mono); font-weight: 400; letter-spacing: 0; }
.sb-stat-chips-steampunk .stat-chip-rate.positive { color: var(--sp-verdigris-300); }
.sb-stat-chips-steampunk .stat-chip-rate.negative { color: var(--sp-ember-400); }
.sb-stat-chips-steampunk .stat-chip-rate.neutral { color: var(--sp-parchment-muted); }
/* State variants re-cast in the theme palette. */
.sb-stat-chips-steampunk .stat-chip.warning { border-color: var(--sp-ember-600); background: linear-gradient(180deg, rgba(120,44,7,0.6), rgba(60,22,6,0.8)); }
.sb-stat-chips-steampunk .stat-chip.warning > strong { color: var(--sp-ember-400); }
.sb-stat-chips-steampunk .stat-chip-dev.is-full { border-color: var(--sp-copper-400); background: linear-gradient(180deg, rgba(110,52,22,0.6), rgba(40,22,10,0.85)); }
.sb-stat-chips-steampunk .stat-chip-weak-def { border-color: var(--sp-ember-600); }
.sb-stat-chips-steampunk .resource-ribbon { border-left-color: var(--sp-brass-700); }

@media (max-width: 900px) {
  .sb-stat-chips-steampunk .stat-chip { border-radius: 4px; align-self: stretch; }
  /* Integrity/Dev used smaller boxes and 6px labels; even them out so the
     four chips in the row share one height and type scale. */
  .sb-stat-chips-steampunk .stat-chip-def-wrap { align-self: stretch; justify-self: stretch; display: grid; min-width: 0; }
  .sb-stat-chips-steampunk .stat-chip-def-wrap > .stat-chip-def { grid-area: auto; width: 100%; }
  .sb-stat-chips-steampunk .stat-chip-def,
  .sb-stat-chips-steampunk .stat-chip-dev { padding: 4px; align-content: start; }
  .sb-stat-chips-steampunk .stat-chip > span,
  .sb-stat-chips-steampunk .stat-chip-def > span,
  .sb-stat-chips-steampunk .stat-chip-dev > span { font-size: 8px; letter-spacing: 0.06em; }
  .sb-stat-chips-steampunk .stat-chip > strong,
  .sb-stat-chips-steampunk .stat-chip-def > strong,
  .sb-stat-chips-steampunk .stat-chip-dev > strong { font-size: 10.5px; line-height: 1.15; }
}
`;

export const STAT_CHIPS_STEAMPUNK_CLASS = "sb-stat-chips-steampunk";

export const ensureStatChipSteampunkStyles = (): void => {
  if (document.getElementById("sb-stat-chip-steampunk-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-stat-chip-steampunk-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
};
