import type { ShardSiteKind } from "@border-empires/shared";

type ShardCollectInfo = {
  kind: ShardSiteKind;
  amount: number;
};

export const showShardCollectOverlay = (info: ShardCollectInfo): void => {
  const existing = document.getElementById("shard-collect-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "shard-collect-overlay";
  overlay.innerHTML = overlayHtml(info);

  injectStyles();
  document.body.appendChild(overlay);

  overlay.style.display = "grid";

  const dismiss = (): void => {
    overlay.remove();
  };

  overlay.querySelector("#shard-collect-close")?.addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });

  setTimeout(dismiss, 4000);
};

const overlayHtml = (info: ShardCollectInfo): string => {
  const kindLabel = info.kind === "FALL" ? "Shard Rain" : "Shard Cache";
  const detail = info.kind === "FALL"
    ? "Collected from a recent shard rain deposit."
    : "Recovered from an ancient shard cache.";
  return `
    <div id="shard-collect-backdrop"></div>
    <div id="shard-collect-modal">
      <div id="shard-collect-art">${artSvg}</div>
      <div id="shard-collect-info">
        <div id="shard-collect-kind">${kindLabel}</div>
        <div id="shard-collect-amount">+${info.amount} Shard${info.amount === 1 ? "" : "s"}</div>
        <div id="shard-collect-detail">${detail}</div>
      </div>
      <button id="shard-collect-close" class="shard-collect-close-btn" type="button" aria-label="Close">✕</button>
    </div>`;
};

let injected = false;
const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
};

const styles = `
#shard-collect-overlay {
  position: fixed; inset: 0; display: none; place-items: center; padding: 20px; z-index: 32;
}
#shard-collect-backdrop {
  position: absolute; inset: 0; background: rgba(1, 6, 12, 0.72); backdrop-filter: blur(4px);
}
#shard-collect-modal {
  position: relative; display: grid; grid-template-columns: auto 1fr; gap: 20px;
  width: min(480px, calc(100vw - 40px)); padding: 24px 28px; border-radius: 26px;
  border: 1px solid rgba(146, 245, 255, 0.3);
  background: radial-gradient(circle at 12% 0%, rgba(50,210,233,0.18), transparent 30%),
    radial-gradient(circle at 90% 12%, rgba(204,239,255,0.12), transparent 34%),
    linear-gradient(180deg, rgba(11,21,34,0.98), rgba(5,10,18,0.98));
  box-shadow: 0 28px 80px rgba(0,0,0,0.42), 0 0 60px rgba(50,210,233,0.15);
  color: #f4fbff; overflow: hidden;
  animation: shardCollectEnter 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
#shard-collect-art { width: 120px; height: 120px; flex-shrink: 0; align-self: center; }
#shard-collect-info { display: grid; gap: 6px; align-content: center; min-width: 0; }
#shard-collect-kind {
  font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(137,226,255,0.88);
}
#shard-collect-amount {
  font-size: 28px; font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; color: #f4fbff;
}
#shard-collect-detail {
  font-size: 14px; color: rgba(222,238,248,0.82); line-height: 1.55; margin-top: 2px;
}
.shard-collect-close-btn {
  position: absolute; top: 12px; right: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 999px;
  border: 1px solid rgba(200,232,255,0.36); background: rgba(10,28,47,0.56);
  color: #f6faff; font-size: 14px; font-weight: 800; line-height: 1; cursor: pointer;
}
.shard-collect-close-btn:hover { background: rgba(14,38,63,0.76); }
@keyframes shardCollectEnter {
  0% { opacity: 0; transform: scale(0.85) translateY(12px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}`;

const artSvg = `<svg width="120" height="120" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="64" cy="96" rx="34" ry="12" fill="rgba(41,26,10,0.28)"/>
  <ellipse cx="64" cy="94" rx="28" ry="10" fill="#2A2016"/>
  <ellipse cx="64" cy="92" rx="20" ry="7" fill="#0E1822"/>
  <ellipse cx="64" cy="88" rx="13" ry="5" fill="rgba(146,245,255,0.18)"/>
  <path d="M64 28L78 46L72 82H56L50 46L64 28Z" fill="#173447"/>
  <path d="M64 36L74 49L69 77H59L54 49L64 36Z" fill="#2FD0EA"/>
  <path d="M64 43L70 52L67 71H61L58 52L64 43Z" fill="#F0FFFF"/>
  <path d="M33 93L46 86L53 95L47 106L34 104L33 93Z" fill="#6F4B20"/>
  <path d="M95 93L82 86L75 95L81 106L94 104L95 93Z" fill="#6F4B20"/>
  <path d="M24 88L37 82L43 89L37 99L25 98L24 88Z" fill="#A26A2B"/>
  <path d="M104 88L91 82L85 89L91 99L103 98L104 88Z" fill="#A26A2B"/>
  <ellipse cx="64" cy="86" rx="24" ry="8" stroke="rgba(255,221,125,0.62)" stroke-width="3"/>
  <ellipse cx="64" cy="86" rx="31" ry="11" stroke="rgba(146,245,255,0.45)" stroke-width="2"/>
</svg>`;
