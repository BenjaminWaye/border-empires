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
  .diplomacy-trade-kinds { display: flex; gap: 8px; margin-bottom: 16px; }
  .diplomacy-trade-kinds button, .diplomacy-trade-actions button, .diplomacy-trade-topup {
    flex: 1; min-height: 40px; padding: 8px 12px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 6px;
    background: rgba(60, 41, 25, .5); color: var(--sp-parchment-100, #f2e8d3);
    font: 600 14px/1.3 var(--sp-font-body, "Spectral", Georgia, serif);
    text-transform: none; letter-spacing: normal; cursor: pointer;
  }
  .diplomacy-trade-kinds button[aria-pressed="true"], .diplomacy-trade-actions [data-trade-send] {
    background: rgba(217, 173, 82, .18); border-color: var(--sp-brass-500, #b8862f);
  }
  .diplomacy-trade-actions [data-trade-send]:disabled { opacity: .55; cursor: not-allowed; }
  .diplomacy-trade-grid { display: grid; grid-template-columns: auto 1fr 1fr; gap: 8px 12px; align-items: center; margin-bottom: 16px; }
  .diplomacy-trade-grid .diplomacy-trade-head {
    color: var(--sp-brass-300, #d9ad52); font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace);
    letter-spacing: .06em; text-transform: uppercase;
  }
  .diplomacy-trade-grid input {
    box-sizing: border-box; width: 100%; min-height: 36px; padding: 6px 8px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 4px;
    background: rgba(12, 9, 6, .55); color: var(--sp-parchment-100, #f2e8d3); font: inherit;
  }
  .diplomacy-trade-verdict { margin: 0 0 12px; padding: 10px 12px; border-radius: 4px; background: rgba(12, 9, 6, .45); }
  .diplomacy-trade-verdict[data-tone="good"] { border-left: 3px solid #7fb069; }
  .diplomacy-trade-verdict[data-tone="bad"] { border-left: 3px solid #c8643c; }
  .diplomacy-trade-verdict[data-tone="neutral"] { border-left: 3px solid var(--sp-brass-500, #b8862f); }
  .diplomacy-trade-topup { flex: none; width: 100%; margin-bottom: 12px; }
  .diplomacy-trade-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .diplomacy-trade-popup button:focus-visible, .diplomacy-trade-popup input:focus-visible {
    outline: 2px solid var(--sp-brass-300, #d9ad52); outline-offset: 2px;
  }
  @media (max-width: 420px) { .diplomacy-trade-popup { padding: 16px; } }
`;
