// Pure HTML builders for Space View's chrome: the resource ribbon (reused
// from client-hud), a Settings entry point, and a "Return to Season" button.
// All other season chrome is deliberately absent — Space View strips down to
// just these three plus the full-bleed 3D canvas.
export const spaceViewLauncherHtml = (): string =>
  `<button type="button" class="sv-launcher" data-space-view-launcher title="Space View" aria-label="Open Space View">🌌</button>`;

export const spaceViewChromeHtml = (ribbonHtml: string): string => `
  <div class="sv-top-bar">
    <div class="sv-ribbon">${ribbonHtml}</div>
    <div class="sv-actions">
      <button type="button" class="sv-btn" data-space-view-manage-planet>Manage Planet</button>
      <button type="button" class="sv-btn" data-space-view-settings>Settings</button>
      <button type="button" class="sv-btn sv-btn-primary" data-space-view-return>Return to Season</button>
    </div>
  </div>
  <div class="sv-settings-panel" data-space-view-settings-panel hidden></div>
  <canvas class="sv-canvas" data-space-view-canvas></canvas>
`;

export const spaceViewStyle = `
  .sv-launcher{position:fixed;right:16px;bottom:264px;z-index:23;width:44px;height:44px;padding:0;margin:0;appearance:none;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(3,7,14,.85);cursor:pointer;pointer-events:auto;font-size:24px;line-height:1;display:grid;place-items:center;color:#94a3b8;transition:color .15s,transform .15s,background .15s}
  .sv-launcher:hover{color:#f1f5f9;background:rgba(11,19,32,.9);transform:scale(1.15)}
  #hud.desktop-side-panel-open ~ .sv-launcher{right:464px}
  @media (max-width: 900px) {
    .sv-launcher{right:8px;bottom:calc(68px + max(8px, env(safe-area-inset-bottom)) + 56px);width:40px;height:40px;font-size:22px}
  }
  .sv-screen{position:fixed;inset:0;z-index:15;background:#030712;display:flex;flex-direction:column}
  .sv-screen[hidden]{display:none}
  .sv-top-bar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:rgba(3,7,14,.72);border-bottom:1px solid rgba(255,255,255,.1);flex-wrap:wrap}
  .sv-actions{display:flex;gap:8px}
  .sv-btn{border:1px solid rgba(255,255,255,.18);background:rgba(15,23,42,.7);color:#e2e8f0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer}
  .sv-btn:hover{background:rgba(30,41,59,.85)}
  .sv-btn-primary{background:#38bdf8;color:#082f49;font-weight:700;border-color:#38bdf8}
  .sv-settings-panel{position:absolute;top:56px;right:16px;z-index:3;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;background:rgba(8,12,24,.97);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:16px}
  .sv-settings-panel[hidden]{display:none}
  .sv-canvas{flex:1;display:block;width:100%;height:100%;touch-action:none}
`;
