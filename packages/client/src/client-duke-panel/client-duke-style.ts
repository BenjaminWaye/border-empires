// Styles for the Duke HUD and panel: the same brass/amber instrument-panel
// language as the rest of Space View.
export const dukeStyle = `
  .dk-hud{position:absolute;top:56px;left:0;z-index:2;pointer-events:none;display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:8px 12px;width:min(440px,calc(100% - 24px))}
  .dk-hud > *{pointer-events:auto}
  .dk-hud[hidden]{display:none}
  .dk-attention{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
  .dk-attn{width:100%;text-align:left;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.35;cursor:pointer;color:#f7ead4;background:linear-gradient(180deg,rgba(38,27,15,.94),rgba(20,14,8,.94));border:1px solid rgba(214,150,68,.45)}
  .dk-attn-urgent{border-color:#ff6b58;box-shadow:0 0 12px rgba(255,107,88,.28)}
  .dk-attn:hover{filter:brightness(1.15)}
  .dk-more{font-size:11px;color:#b9926a;padding-left:6px}
  .dk-calm{padding:8px 12px;border-radius:8px;font-size:13px;color:#9fdcd2;background:rgba(15,10,6,.88);border:1px solid rgba(111,210,198,.35)}
  .dk-fallen{padding:8px 12px;border-radius:8px;background:rgba(160,50,40,.85);color:#fff3dc;font-size:13px;text-align:center}
  .dk-meters{display:flex;gap:8px;flex-wrap:wrap}
  .dk-meter{flex:1 1 130px;display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:8px;background:rgba(15,10,6,.88);border:1px solid rgba(214,150,68,.28);cursor:help}
  .dk-meter-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#b9926a}
  .dk-meter-value{font-size:18px;font-weight:700;color:#ffd68f}
  .dk-meter-hint{font-size:11px;color:#c9b08a}
  .dk-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
  .dk-bar-fill{display:block;height:100%;background:#ff6b58}
  .dk-tabs{display:flex;gap:6px;margin:0 0 10px}
  .dk-tab{flex:1;padding:8px 6px;border-radius:6px;border:1px solid rgba(214,150,68,.3);background:transparent;color:#c9b08a;font-size:13px;font-weight:600;cursor:pointer;position:relative}
  .dk-tab-on{background:rgba(214,150,68,.18);color:#ffd68f;border-color:rgba(255,214,148,.6)}
  .dk-dot{position:absolute;top:5px;right:8px;width:8px;height:8px;border-radius:50%;background:#ff6b58}
  .dk-pills{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
  .dk-pill{padding:5px 10px;border-radius:14px;border:1px solid rgba(214,150,68,.35);background:transparent;color:#c9b08a;font-size:12px;cursor:pointer}
  .dk-pill-on{background:rgba(214,150,68,.22);color:#ffd68f}
  .dk-message{margin:0 0 10px;padding:8px 10px;border-radius:6px;background:rgba(160,50,40,.35);border:1px solid rgba(255,110,90,.5);color:#ffe4dc;font-size:13px}
  .dk-message[hidden]{display:none}
  .dk-sys-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}
  .dk-sys-head h3{margin:0;font-size:17px;color:#ffd68f}
  .dk-tag{font-size:11px;color:#b9926a;text-transform:uppercase;letter-spacing:.06em}
  .dk-stab{height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin:4px 0 6px}
  .dk-stab-fill{height:100%;background:linear-gradient(90deg,#c9a227,#6fd2c6)}
  .dk-stab-court{background:#ff6b58}
  .dk-line{margin:4px 0;font-size:13px;color:#f0e0c8}
  .dk-alert{margin:6px 0;padding:6px 10px;border-radius:6px;font-size:13px}
  .dk-alert-bad{background:rgba(160,50,40,.4);border:1px solid rgba(255,110,90,.5);color:#ffe4dc}
  .dk-alert-ok{background:rgba(40,110,100,.3);border:1px solid rgba(111,210,198,.5);color:#dff7f2}
  .dk-progress{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}
  .dk-progress > div{height:100%;background:#6fd2c6}
  .dk-card{margin:0 0 10px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(214,150,68,.22);color:#f0e0c8;font-size:13px}
  .dk-card h4{margin:0 0 6px;font-size:14px;color:#ffd68f}
  .dk-card h4 small{font-weight:400;color:#b9926a;margin-left:6px}
  .dk-sub{margin-top:12px !important}
  .dk-offer{border-color:#6fd2c6}
  .dk-note{margin:0 0 8px;color:#c9b08a;font-size:12px}
  .dk-list{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px}
  .dk-list em{color:#b9926a;font-style:normal;font-size:11px;margin-right:4px}
  .dk-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}
  .dk-ships{display:flex;gap:8px;flex-wrap:wrap}
  .dk-ship{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:74px;padding:8px 10px;border-radius:8px;border:1px solid rgba(214,150,68,.4);background:rgba(45,32,18,.85);color:#f0e0c8;font-size:13px;font-weight:600;cursor:pointer}
  .dk-ship small{font-weight:400;font-size:11px;color:#c9b08a}
  .dk-ship-icon{font-size:18px;color:#ffd68f}
  .dk-ship-on{border-color:#6fd2c6;background:rgba(40,110,100,.3);box-shadow:0 0 10px rgba(111,210,198,.3)}
  .dk-order{margin-top:10px;padding-top:8px;border-top:1px dashed rgba(214,150,68,.25)}
  .dk-builds{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
  .dk-btn{border:1px solid rgba(214,150,68,.45);background:linear-gradient(180deg,rgba(60,42,24,.9),rgba(30,21,12,.9));color:#f0e0c8;border-radius:6px;padding:7px 10px;font-size:13px;font-weight:600;cursor:pointer;text-align:left}
  .dk-btn small{display:block;font-weight:400;font-size:11px;color:#c9b08a}
  .dk-btn:disabled{opacity:.45;cursor:not-allowed}
  .dk-btn-quiet{background:transparent}
  .dk-build-cost{color:#ffd68f !important}
  .dk-bodies{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
  .dk-body{display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.2)}
  .dk-body-built{border-left:3px solid #6fd2c6;font-size:12px}
  .dk-body-name{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#b9926a}
  .dk-card select,.dk-card input[type=number]{background:rgba(0,0,0,.35);color:#f0e0c8;border:1px solid rgba(214,150,68,.35);border-radius:6px;padding:6px 8px;font-size:13px;max-width:100%}
  .dk-card input[type=number]{width:84px}
  .dk-card input[type=range]{flex:1;min-width:80px}
  .dk-combat{color:#f0e0c8}.dk-court{color:#9fdcd2}.dk-intel{color:#c9d6ff}.dk-economy{color:#e8d6a8}.dk-politics{color:#f2c4a8}
  @media (max-width:600px){
    /* Compact HUD: two attention lines, meters as one row of chips. The HUD steps
       aside while a panel is open, since the bottom sheet covers that space. */
    .dk-hud{top:60px;padding:6px 8px;gap:6px}
    .dk-attention li:nth-child(n+3):not(.dk-more){display:none}
    .dk-attn{padding:8px 10px;font-size:13px;min-height:40px}
    .dk-meters{flex-wrap:nowrap;gap:6px}
    .dk-meter{flex:1 1 0;min-width:0;padding:6px 8px}
    .dk-meter-hint{display:none}
    .dk-meter-value{font-size:15px}
    .sv-screen.sv-panel-open .dk-hud{display:none}
    .dk-tab,.dk-pill,.dk-btn,.dk-ship{min-height:40px}
    .dk-builds{grid-template-columns:1fr 1fr}
    .dk-card select,.dk-card input[type=number]{min-height:40px;font-size:16px}
  }
`;
