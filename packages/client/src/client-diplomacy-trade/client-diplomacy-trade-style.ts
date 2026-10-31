// The same brass, parchment, panel and type tokens as the game HUD (see
// client-occupation-survey-style.ts).
export const diplomacyTradeStyles = `
  .diplomacy-trade-overlay {
    position: fixed; inset: 0; z-index: 34; display: grid; place-items: center;
    box-sizing: border-box; padding: 16px;
    background: rgba(12, 9, 6, .72); backdrop-filter: blur(4px);
  }
  .diplomacy-trade-popup {
    box-sizing: border-box; width: min(1080px, 100%); max-height: calc(100dvh - 32px);
    overflow: auto; padding: 24px; border: 1px solid var(--sp-brass-700, #8a611f);
    border-radius: 6px; background: var(--sp-panel-bg, linear-gradient(175deg, #2b2015, #14100a));
    color: var(--sp-parchment-100, #f2e8d3);
    box-shadow: 0 28px 72px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(244, 223, 166, .08);
    font: 400 15px/1.5 var(--sp-font-body, "Spectral", Georgia, serif);
    text-align: left; text-transform: none; letter-spacing: normal;
    container-type: inline-size;
  }
  .diplomacy-trade-kicker {
    display: block; margin-bottom: 8px; color: var(--sp-brass-300, #d9ad52);
    font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace);
    letter-spacing: .08em; text-transform: uppercase;
  }
  .diplomacy-trade-popup h2 {
    margin: 0 0 8px; color: var(--sp-brass-100, #f4dfa6);
    font: 600 22px/1.35 var(--sp-font-display, "Cinzel", Georgia, serif);
  }
  .diplomacy-trade-stance { margin: 0 0 16px; color: var(--sp-parchment-muted, #bda880); font-size: 14px; }
  .diplomacy-trade-modifiers {
    margin: -8px 0 16px; padding: 0; list-style: none; font-size: 13px;
    color: var(--sp-parchment-muted, #bda880);
  }
  .diplomacy-trade-modifiers li span {
    display: inline-block; min-width: 32px; font: 600 12px/1.6 var(--sp-font-mono, "Space Mono", monospace);
  }
  .diplomacy-trade-modifiers li[data-tone="good"] span { color: #9cc983; }
  .diplomacy-trade-modifiers li[data-tone="bad"] span { color: #e08a64; }
  .diplomacy-trade-war { margin: -8px 0 16px; font-size: 13px; color: var(--sp-parchment-muted, #bda880); }
  .diplomacy-trade-war-head {
    display: block; margin-bottom: 2px; color: var(--sp-brass-300, #d9ad52);
    font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace); letter-spacing: .06em; text-transform: uppercase;
  }
  .diplomacy-trade-war ul { margin: 0; padding: 0; list-style: none; }
  .diplomacy-trade-war li span {
    display: inline-block; min-width: 32px; color: var(--sp-parchment-100, #f2e8d3);
    font: 600 12px/1.6 var(--sp-font-mono, "Space Mono", monospace);
  }
  .diplomacy-trade-head { margin-bottom: 16px; }
  .diplomacy-trade-columns {
    display: grid; gap: 12px; align-items: start;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr);
    grid-template-areas: "mine deal theirs";
  }
  .diplomacy-trade-side[data-trade-side="give"] { grid-area: mine; border-top: 3px solid #3fb0a6; }
  .diplomacy-trade-side[data-trade-side="ask"] { grid-area: theirs; border-top: 3px solid #c8643c; }
  .diplomacy-trade-deal { grid-area: deal; position: sticky; top: 0; }
  .diplomacy-trade-side, .diplomacy-trade-deal {
    min-width: 0; box-sizing: border-box; padding: 12px; border: 1px solid rgba(138, 97, 31, .55); border-radius: 6px;
    background: rgba(12, 9, 6, .4);
  }
  .diplomacy-trade-deal { background: rgba(43, 32, 21, .6); border-color: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-side h3, .diplomacy-trade-deal h3 {
    margin: 0 0 10px; color: var(--sp-brass-100, #f4dfa6); overflow-wrap: anywhere;
    font: 600 16px/1.3 var(--sp-font-display, "Cinzel", Georgia, serif);
  }
  .diplomacy-trade-subhead {
    margin: 12px 0 6px; color: var(--sp-brass-300, #d9ad52);
    font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace); letter-spacing: .06em; text-transform: uppercase;
  }
  .diplomacy-trade-subhead:first-of-type { margin-top: 0; }
  .diplomacy-trade-kinds { display: grid; gap: 6px; }
  .diplomacy-trade-kinds button, .diplomacy-trade-actions button, .diplomacy-trade-suggest {
    min-height: 40px; padding: 8px 12px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 6px;
    background: rgba(60, 41, 25, .5); color: var(--sp-parchment-100, #f2e8d3);
    font: 600 14px/1.3 var(--sp-font-body, "Spectral", Georgia, serif);
    text-transform: none; letter-spacing: normal; cursor: pointer;
  }
  .diplomacy-trade-kinds button { text-align: left; }
  .diplomacy-trade-kinds button:hover:not(:disabled) { border-color: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-kinds button[aria-pressed="true"], .diplomacy-trade-actions [data-trade-send] {
    background: rgba(217, 173, 82, .18); border-color: var(--sp-brass-300, #d9ad52);
  }
  .diplomacy-trade-kinds button[aria-pressed="true"]::after { content: " ✓"; color: var(--sp-brass-100, #f4dfa6); }
  .diplomacy-trade-kinds button:disabled { opacity: .45; cursor: not-allowed; }
  .diplomacy-trade-actions [data-trade-send]:disabled, .diplomacy-trade-suggest:disabled { opacity: .55; cursor: not-allowed; }
  .diplomacy-trade-goods { display: grid; gap: 6px; }
  .diplomacy-trade-good-row[hidden], .diplomacy-trade-subhead[hidden] { display: none; }
  .diplomacy-trade-good {
    display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 8px;
    box-sizing: border-box; width: 100%; min-height: 44px; padding: 6px 10px;
    border: 1px solid rgba(138, 97, 31, .6); border-radius: 6px;
    background: rgba(60, 41, 25, .35); color: var(--sp-parchment-100, #f2e8d3); text-align: left;
    font: 600 14px/1.2 var(--sp-font-body, "Spectral", Georgia, serif); text-transform: none; letter-spacing: normal; cursor: pointer;
  }
  .diplomacy-trade-good:hover:not(:disabled) { border-color: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-good[data-chosen="true"] { background: rgba(217, 173, 82, .14); border-color: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-good[aria-expanded="true"] { border-color: var(--sp-brass-300, #d9ad52); box-shadow: inset 0 0 0 1px var(--sp-brass-300, #d9ad52); }
  .diplomacy-trade-good:disabled { opacity: .4; cursor: not-allowed; }
  .diplomacy-trade-good-icon { display: grid; place-items: center; width: 28px; height: 28px; }
  .diplomacy-trade-good-icon img { width: 28px; height: 28px; object-fit: contain; }
  .diplomacy-trade-good-name { display: grid; min-width: 0; }
  .diplomacy-trade-good-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diplomacy-trade-good-have { color: var(--sp-parchment-muted, #bda880); font: 400 11px/1.4 var(--sp-font-mono, "Space Mono", monospace); }
  .diplomacy-trade-good-have:empty { display: none; }
  .diplomacy-trade-good-amount { color: var(--sp-brass-100, #f4dfa6); font: 600 15px/1.2 var(--sp-font-mono, "Space Mono", monospace); }
  .diplomacy-trade-good[data-chosen="false"] .diplomacy-trade-good-amount { visibility: hidden; }
  .diplomacy-trade-deal-items { margin-bottom: 12px; }
  .diplomacy-deal-empty { margin: 0; padding: 18px 8px; text-align: center; color: var(--sp-parchment-muted, #bda880); font-style: italic; }
  .diplomacy-deal-treaty {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding: 8px 10px;
    border: 1px solid var(--sp-brass-300, #d9ad52); border-radius: 6px; background: rgba(217, 173, 82, .16);
    color: var(--sp-brass-100, #f4dfa6); font: 600 15px/1.3 var(--sp-font-display, "Cinzel", Georgia, serif);
  }
  .diplomacy-deal-side { margin-bottom: 10px; }
  .diplomacy-deal-side h4 {
    margin: 0 0 4px; color: var(--sp-brass-300, #d9ad52);
    font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace); letter-spacing: .06em; text-transform: uppercase;
  }
  .diplomacy-deal-side ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .diplomacy-deal-item { display: flex; align-items: center; gap: 6px; }
  .diplomacy-deal-edit {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 8px;
    border: 1px solid rgba(138, 97, 31, .45); border-radius: 4px; background: rgba(12, 9, 6, .35);
    color: var(--sp-parchment-100, #f2e8d3); font: 400 14px/1.3 var(--sp-font-body, "Spectral", Georgia, serif); text-align: left; cursor: pointer;
  }
  .diplomacy-deal-edit b { font-family: var(--sp-font-mono, "Space Mono", monospace); color: var(--sp-brass-100, #f4dfa6); }
  .diplomacy-deal-edit small { color: var(--sp-parchment-muted, #bda880); }
  .diplomacy-deal-icon { display: inline-grid; place-items: center; width: 20px; height: 20px; flex: none; }
  .diplomacy-deal-icon img { width: 20px; height: 20px; object-fit: contain; }
  .diplomacy-deal-remove {
    flex: none; width: 32px; height: 32px; padding: 0; border: 1px solid transparent; border-radius: 4px;
    background: none; color: var(--sp-parchment-muted, #bda880); font-size: 14px; cursor: pointer;
  }
  .diplomacy-deal-remove:hover { color: #e08a64; border-color: rgba(224, 138, 100, .5); }
  .diplomacy-deal-none { margin: 0; color: var(--sp-parchment-muted, #bda880); font-size: 13px; font-style: italic; }
  .diplomacy-deal-note { margin: 0; color: var(--sp-parchment-muted, #bda880); font-size: 12px; }
  .diplomacy-trade-slider { margin-top: 10px; }
  .diplomacy-trade-slider-row { display: flex; align-items: center; gap: 8px; }
  .diplomacy-trade-slider input[type="number"] {
    box-sizing: border-box; width: 72px; flex: none; min-height: 32px; padding: 4px 6px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 4px;
    background: rgba(12, 9, 6, .55); color: var(--sp-parchment-100, #f2e8d3);
    font: 600 13px/1.2 var(--sp-font-mono, "Space Mono", monospace);
  }
  .diplomacy-trade-slider input[type="range"] {
    --fill: 0%;
    display: block; box-sizing: border-box; flex: 1; min-width: 0; width: 100%; height: 24px; margin: 0; padding: 0;
    background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer;
  }
  .diplomacy-trade-slider input[type="range"]::-webkit-slider-runnable-track {
    height: 6px; border-radius: 3px; border: 1px solid var(--sp-brass-700, #8a611f);
    background: linear-gradient(90deg, var(--sp-brass-500, #b8862f) var(--fill), rgba(12, 9, 6, .7) var(--fill));
  }
  .diplomacy-trade-slider input[type="range"]::-moz-range-track {
    height: 6px; border-radius: 3px; border: 1px solid var(--sp-brass-700, #8a611f); background: rgba(12, 9, 6, .7);
  }
  .diplomacy-trade-slider input[type="range"]::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 20px; margin-top: -8px; border-radius: 50%;
    border: 2px solid var(--sp-brass-100, #f4dfa6); background: var(--sp-brass-500, #b8862f); box-shadow: 0 2px 6px rgba(0, 0, 0, .5);
  }
  .diplomacy-trade-slider input[type="range"]::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid var(--sp-brass-100, #f4dfa6); background: var(--sp-brass-500, #b8862f); box-shadow: 0 2px 6px rgba(0, 0, 0, .5);
  }
  .diplomacy-trade-slider-ends {
    display: flex; justify-content: space-between; margin-top: 2px; color: var(--sp-parchment-muted, #bda880);
    font: 400 11px/1.4 var(--sp-font-mono, "Space Mono", monospace);
  }
  .diplomacy-trade-verdict { margin: 0 0 12px; padding: 10px 12px; border-radius: 4px; background: rgba(12, 9, 6, .45); }
  .diplomacy-trade-verdict[data-tone="good"] { border-left: 3px solid #7fb069; }
  .diplomacy-trade-verdict[data-tone="bad"] { border-left: 3px solid #c8643c; }
  .diplomacy-trade-verdict[data-tone="neutral"] { border-left: 3px solid var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-suggest { display: block; width: 100%; margin-bottom: 12px; }
  .diplomacy-trade-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .diplomacy-trade-actions button { flex: 1; }
  .diplomacy-trade-popup button:focus-visible, .diplomacy-trade-popup input:focus-visible {
    outline: 2px solid var(--sp-brass-300, #d9ad52); outline-offset: 2px;
  }
  .diplomacy-resource-terms { margin: 16px 0 0; border-top: 1px solid rgba(184,134,47,.3); padding-top: 12px; }
  .diplomacy-resource-terms h3 { font-size: 15px; margin: 0 0 8px; }
  .resource-trade-action { background: #2b2115; color: inherit; border: 1px solid #8a611f; border-radius: 4px; padding: 6px 12px; margin: 8px 8px 0 0; cursor: pointer; font: inherit; }
  .diplomacy-resource-agreement { font-size: 12px; line-height: 1.6; padding: 8px 0; }
  [data-resource-agreements]:empty { display: none; }
  #diplomacy-trade-title:focus { outline: none; }
  @media (max-width: 420px) { .diplomacy-trade-popup { padding: 16px; } }
  /* By the screen's own width: HUD v2 hosts it in a column narrower than the viewport. */
  @container (max-width: 760px) {
    .diplomacy-trade-columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "mine theirs" "deal deal"; }
    .diplomacy-trade-deal { position: static; }
  }
  @container (max-width: 440px) {
    .diplomacy-trade-columns { grid-template-columns: minmax(0, 1fr); grid-template-areas: "mine" "theirs" "deal"; }
  }
`;
