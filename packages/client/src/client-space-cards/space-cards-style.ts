// Styles for Space View's action cards (§30), in HUD v2's language: flat
// brass-edged ink panels, Cinzel headings, Space Mono numbers, the same
// tokens (client-hud-v2.css), scoped here because Space View is its own screen.
export const spaceCardsStyle = `
.sc-root {
  --v2-ink: rgba(15, 13, 10, 0.94); --v2-chip: #1d1913; --v2-well: #16130e; --v2-line: #3a3125; --v2-edge: #5a4828;
  --v2-gold: #d9b25c; --v2-gold-hi: #f0cf82; --v2-text: #ece2cc; --v2-muted: #a8997c; --v2-soft: #bda880;
  --v2-amber: #e0a845; --v2-red: #d06a5a; --v2-red-hi: #e8907f; --v2-green: #6fbf73; --v2-green-hi: #8fd99a;
  --v2-display: "Cinzel", Georgia, serif; --v2-body: "Spectral", Georgia, serif; --v2-mono: "Space Mono", monospace;
  position: absolute; inset: 0; pointer-events: none; z-index: 30; color: var(--v2-text); font-family: var(--v2-body); font-variant-numeric: tabular-nums;
}
.sc-root[hidden] { display: none; }
.sc-root button { font: inherit; color: inherit; cursor: pointer; }
.sc-root button:disabled { cursor: not-allowed; }
.sc-root :focus-visible { outline: 2px solid var(--v2-gold-hi); outline-offset: 2px; }
.sc-bar, .sc-systems, .sc-hand-wrap { pointer-events: auto; }
/* The bar and the systems strip stack, so neither can cover the other. */
.sc-top { position: absolute; top: 64px; left: 16px; right: 16px; display: grid; gap: 8px; justify-items: start; }
.sc-bar {
  width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  min-height: 46px; padding: 6px 10px; background: var(--v2-ink); border: 1px solid var(--v2-edge); box-shadow: 0 10px 28px rgba(0,0,0,.5); box-sizing: border-box;
}
.sc-back { height: 34px; padding: 0 12px; background: var(--v2-chip); border: 1px solid var(--v2-line); font-family: var(--v2-display); font-weight: 700; }
.sc-back:hover { border-color: var(--v2-gold); }
.sc-race { display: grid; gap: 3px; width: min(320px, 100%); }
.sc-race-bar { height: 8px; background: #2a241b; }
.sc-race-bar span { display: block; height: 8px; background: var(--v2-gold-hi); }
.sc-race-text { display: flex; justify-content: space-between; gap: 8px; font-family: var(--v2-mono); font-size: 11px; color: var(--v2-muted); }
.sc-race-text b { color: var(--v2-gold-hi); }
.sc-stat { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; background: var(--v2-chip); border: 1px solid var(--v2-line); font-family: var(--v2-mono); font-size: 13px; }
.sc-stat span { color: var(--v2-muted); font-size: 11px; }
.sc-systems { display: flex; flex-wrap: wrap; gap: 6px; max-width: 100%; }
.sc-sys { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; background: var(--v2-ink); border: 1px solid var(--v2-line); font-family: var(--v2-display); font-weight: 700; font-size: 13px; }
.sc-sys-on { border-color: var(--v2-gold); background: #2a241b; }
.sc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--v2-gold-hi); box-shadow: 0 0 6px var(--v2-gold); }
.sc-stab { display: block; width: 44px; height: 6px; background: #3a3125; }
.sc-stab span { display: block; height: 6px; }
.sc-stab-ok span { background: var(--v2-green); } .sc-stab-warn span { background: var(--v2-amber); } .sc-stab-bad span { background: var(--v2-red); }
.sc-num { font-family: var(--v2-mono); font-size: 12px; font-weight: 400; }
.sc-bodies { display: flex; flex-wrap: wrap; gap: 6px; pointer-events: auto; }
.sc-body { display: flex; gap: 6px; align-items: center; padding: 4px 9px; background: var(--v2-ink); border: 1px solid var(--v2-line); font-size: 12px; color: var(--v2-soft); }
.sc-body b { font-family: var(--v2-display); color: var(--v2-text); }
.sc-body-base { border-color: var(--v2-edge); }
.sc-body-dev { border-color: var(--v2-gold); color: var(--v2-gold-hi); }
.sc-body-building { box-shadow: 0 0 0 1px var(--v2-gold) inset; }
.sc-body-hit { border-color: var(--v2-red); color: var(--v2-red-hi); }
.sc-hand-wrap { position: absolute; left: 0; right: 0; bottom: 18px; display: grid; justify-items: center; gap: 8px; padding: 0 16px; }
.sc-turn { margin: 0; padding: 5px 12px; background: var(--v2-ink); border: 1px solid var(--v2-line); font-size: 13px; color: var(--v2-soft); }
.sc-turn b { color: var(--v2-gold-hi); font-family: var(--v2-display); }
.sc-link { background: none; border: 0; padding: 0 0 0 6px; color: var(--v2-gold); text-decoration: underline; }
.sc-message { margin: 0; padding: 5px 12px; background: #2a1613; border: 1px solid var(--v2-red); font-size: 13px; }
.sc-hand { display: flex; align-items: flex-end; justify-content: center; gap: 12px; max-width: 100%; overflow-x: auto; padding: 4px 2px 6px; }
.sc-card {
  flex: 0 0 auto; width: 188px; min-height: 232px; display: flex; flex-direction: column; gap: 9px; padding: 12px; box-sizing: border-box;
  background: linear-gradient(180deg, #221d16 0%, #14110d 100%); border: 2px solid var(--v2-edge); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.55);
}
.sc-urgent { min-height: 256px; border-color: var(--v2-red-hi); }
.sc-free { border-style: dashed; }
.sc-off { opacity: .62; }
.sc-card-top { display: flex; justify-content: space-between; align-items: center; }
.sc-icon { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 50%; background: #2a241b; color: var(--v2-gold); }
.sc-urgent .sc-icon { background: #4a1f1a; color: #ffb3a3; }
.sc-badge { padding: 3px 8px; border-radius: 10px; background: var(--v2-edge); font-family: var(--v2-mono); font-size: 12px; font-weight: 700; color: #fff4ea; }
.sc-urgent .sc-badge { background: #c0503f; }
.sc-title { margin: 0; font-family: var(--v2-display); font-size: 16px; line-height: 1.15; color: #f6ecd4; }
.sc-chips { display: grid; gap: 5px; margin-top: auto; font-family: var(--v2-mono); font-size: 12px; }
.sc-gain, .sc-cost { display: flex; gap: 6px; padding: 5px 8px; border-radius: 6px; }
.sc-gain { background: rgba(111,191,115,.14); color: var(--v2-green-hi); }
.sc-cost { background: rgba(217,178,92,.10); color: var(--v2-gold); }
.sc-play { min-height: 44px; background: #2a241b; border: 1px solid var(--v2-gold); border-radius: 6px; font-size: 15px; font-weight: 600; color: #f6ecd4; }
.sc-play:not(:disabled):hover { background: #3a3125; }
.sc-urgent .sc-play:not(:disabled) { background: #5a2a20; }
.sc-play:disabled { border-color: var(--v2-line); font-size: 12px; color: var(--v2-muted); }
.sc-alt { min-height: 36px; background: transparent; border: 1px solid var(--v2-line); border-radius: 6px; font-size: 13px; color: var(--v2-soft); }
/* The cards' bar replaces the old stats and attention list (the panels stay). */
.sv-cards-on .dk-hud, .sv-cards-on .sv-stats { display: none !important; }
@media (max-width: 900px) {
  /* Clear the Space View tab bar pinned to the bottom of the screen. */
  .sc-hand-wrap { bottom: calc(var(--mobile-nav-height, 68px) + var(--mobile-bottom-safe, 8px) + 16px); }
  .sc-top { top: 56px; left: 12px; right: 12px; }
  .sc-systems { flex-wrap: nowrap; overflow-x: auto; }
}
@media (max-width: 600px) {
  .sc-hand { justify-content: flex-start; }
  .sc-race { width: 100%; }
  .sc-card { width: 150px; min-height: 212px; }
  .sc-urgent { min-height: 226px; }
}
`;
