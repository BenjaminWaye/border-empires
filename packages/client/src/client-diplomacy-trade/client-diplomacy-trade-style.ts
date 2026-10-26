// The same brass, parchment, panel and type tokens as the game HUD (see
// client-occupation-survey-style.ts).
export const diplomacyTradeStyles = `
  .diplomacy-trade-overlay {
    position: fixed; inset: 0; z-index: 34; display: grid; place-items: center;
    box-sizing: border-box; padding: 16px;
    background: rgba(12, 9, 6, .72); backdrop-filter: blur(4px);
  }
  .diplomacy-trade-popup {
    box-sizing: border-box; width: min(460px, 100%); max-height: calc(100dvh - 32px);
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
  .diplomacy-trade-kinds { display: flex; gap: 8px; margin-bottom: 16px; }
  .diplomacy-trade-kinds button, .diplomacy-trade-actions button, .diplomacy-trade-suggest {
    flex: 1; min-height: 40px; padding: 8px 12px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 6px;
    background: rgba(60, 41, 25, .5); color: var(--sp-parchment-100, #f2e8d3);
    font: 600 14px/1.3 var(--sp-font-body, "Spectral", Georgia, serif);
    text-transform: none; letter-spacing: normal; cursor: pointer;
  }
  .diplomacy-trade-kinds button[aria-pressed="true"], .diplomacy-trade-actions [data-trade-send] {
    background: rgba(217, 173, 82, .18); border-color: var(--sp-brass-500, #b8862f);
  }
  .diplomacy-trade-actions [data-trade-send]:disabled, .diplomacy-trade-suggest:disabled { opacity: .55; cursor: not-allowed; }
  .diplomacy-trade-sides { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .diplomacy-trade-side {
    min-width: 0; padding: 10px 12px 12px; border: 1px solid rgba(138, 97, 31, .55); border-radius: 6px;
    background: rgba(12, 9, 6, .4);
  }
  .diplomacy-trade-side h3 {
    margin: 0 0 8px; color: var(--sp-brass-300, #d9ad52);
    font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace); letter-spacing: .06em; text-transform: uppercase;
  }
  .diplomacy-trade-goods { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
  .diplomacy-trade-good {
    display: grid; justify-items: center; gap: 2px; min-height: 84px; padding: 8px 4px;
    border: 1px solid rgba(138, 97, 31, .6); border-radius: 6px;
    background: rgba(60, 41, 25, .35); color: var(--sp-parchment-muted, #bda880);
    font: 600 13px/1.2 var(--sp-font-body, "Spectral", Georgia, serif); text-transform: none; letter-spacing: normal; cursor: pointer;
  }
  .diplomacy-trade-good:hover:not(:disabled) { border-color: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-good[data-chosen="true"] { color: var(--sp-parchment-100, #f2e8d3); background: rgba(217, 173, 82, .14); border-color: var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-good[aria-expanded="true"] { border-color: var(--sp-brass-300, #d9ad52); box-shadow: inset 0 0 0 1px var(--sp-brass-300, #d9ad52); }
  .diplomacy-trade-good:disabled { opacity: .4; cursor: not-allowed; }
  .diplomacy-trade-good-icon { display: grid; place-items: center; width: 32px; height: 32px; }
  .diplomacy-trade-good-icon img { width: 32px; height: 32px; object-fit: contain; }
  .diplomacy-trade-good-amount { color: var(--sp-brass-100, #f4dfa6); font: 600 15px/1.2 var(--sp-font-mono, "Space Mono", monospace); }
  .diplomacy-trade-good[data-chosen="false"] .diplomacy-trade-good-amount { color: var(--sp-parchment-muted, #bda880); opacity: .7; }
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
  .diplomacy-trade-suggest { flex: none; width: 100%; margin-bottom: 12px; }
  .diplomacy-trade-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .diplomacy-trade-popup button:focus-visible, .diplomacy-trade-popup input:focus-visible {
    outline: 2px solid var(--sp-brass-300, #d9ad52); outline-offset: 2px;
  }
  .diplomacy-resource-terms { margin: 16px 0; border-top: 1px solid rgba(184,134,47,.3); padding-top: 12px; }
  .diplomacy-resource-terms h3 { font-size: 15px; margin: 0 0 8px; }
  .diplomacy-resource-terms p { font-size: 12px; line-height: 1.5; opacity: .75; }
  .diplomacy-resource-terms table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .diplomacy-resource-terms th { text-align: left; font-weight: 400; font-size: 12px; }
  .diplomacy-resource-terms th:first-child { width: 46%; }
  .diplomacy-resource-terms td, .diplomacy-resource-terms th { padding: 6px 4px; border-bottom: 1px solid rgba(184,134,47,.15); }
  .diplomacy-trade-popup:has(.diplomacy-resource-terms table) { width: min(620px, 100%); }
  .diplomacy-resource-terms input { width: 100%; box-sizing: border-box; padding: 8px; min-height: 36px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 4px;
    background: rgba(12,9,6,.45); color: var(--sp-parchment-100, #f2e8d3); font: inherit; }
  .diplomacy-resource-agreement { font-size: 12px; line-height: 1.6; padding: 8px 0; }
  [data-resource-agreements]:empty { display: none; }
  .diplomacy-trade-actions { position: sticky; bottom: -24px; background: #20190f; padding: 12px 0; }
  #diplomacy-trade-title:focus { outline: none; }
  .diplomacy-resource-terms small { display: block; opacity: .65; font-size: 11px; margin-top: 3px; }
  .diplomacy-supply-term { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; }
  .diplomacy-supply-term select { background: #211b14; color: inherit; border: 1px solid #8c6a32; border-radius: 4px; padding: 8px; }
  @media (max-width: 420px) { .diplomacy-trade-popup { padding: 16px; } }
  /* By the screen's own width: HUD v2 hosts it in a column narrower than the viewport. */
  @container (max-width: 390px) { .diplomacy-trade-sides { grid-template-columns: 1fr; } }
`;
