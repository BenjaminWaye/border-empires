import type { Meta, StoryObj } from "@storybook/html-vite";
import { DISCOVERY_TIPS, type DiscoveryTipId } from "@client/client-discovery-tips/client-discovery-tips.js";

const ALL_IDS: DiscoveryTipId[] = ["TOWN", "DOCK", "BARBARIAN", "FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];

const TOAST_STYLES = `
.sb-discovery-tip {
  position: relative;
  width: min(320px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(230, 178, 106, 0.32);
  background: linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98));
  box-shadow: 0 18px 48px rgba(0,0,0,0.45), 0 0 40px rgba(214,150,68,0.12);
  color: #fbf3e6;
}
.sb-discovery-tip-title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  padding-right: 20px;
  margin-bottom: 6px;
  color: #ffd68f;
}
.sb-discovery-tip-body {
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(240,224,200,0.86);
  margin: 0 0 10px;
}
.sb-discovery-tip-mute-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 11.5px;
  color: rgba(230, 214, 195, 0.7);
  cursor: pointer;
  user-select: none;
}
.sb-discovery-tip-mute-row input { accent-color: #d69644; cursor: pointer; }
.sb-discovery-tip-ack {
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255,214,148,0.5);
  background: linear-gradient(180deg, rgba(255,214,148,0.22), rgba(214,150,68,0.14));
  color: #ffe6b8;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}
.sb-discovery-tip-ack:hover { background: linear-gradient(180deg, rgba(255,214,148,0.32), rgba(214,150,68,0.22)); }
`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const render = (): HTMLElement => {
  const style = document.createElement("style");
  style.textContent = TOAST_STYLES;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.style.display = "grid";
  container.style.gap = "16px";
  container.style.padding = "32px 28px";
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.maxWidth = "700px";
  container.style.background = "#0a0e14";

  const header = document.createElement("h1");
  header.style.margin = "0";
  header.style.color = "#ffd68f";
  header.style.fontSize = "16px";
  header.style.fontWeight = "800";
  header.style.letterSpacing = "-0.01em";
  header.textContent = "Discovery Tooltips — Actual In-Game Toast";
  container.appendChild(header);

  const subtitle = document.createElement("p");
  subtitle.style.margin = "0 0 4px 0";
  subtitle.style.color = "rgba(201, 216, 236, 0.6)";
  subtitle.style.fontSize = "12.5px";
  subtitle.style.lineHeight = "1.5";
  subtitle.textContent =
    "Rendered with the same HTML/CSS as client-discovery-tip-overlay.ts. Source: client-discovery-tips.ts → DISCOVERY_TIPS";
  container.appendChild(subtitle);

  for (const id of ALL_IDS) {
    const tip = DISCOVERY_TIPS[id];
    const toast = document.createElement("div");
    toast.className = "sb-discovery-tip";

    toast.innerHTML = `
      <div class="sb-discovery-tip-title">${escapeHtml(tip.title)}</div>
      <p class="sb-discovery-tip-body">${escapeHtml(tip.body)}</p>
      <label class="sb-discovery-tip-mute-row"><input type="checkbox" /> Don't show tooltips</label>
      <button class="sb-discovery-tip-ack" type="button">Got it</button>`;

    container.appendChild(toast);
  }

  return container;
};

const meta: Meta = {
  title: "UI/Discovery Tips",
  parameters: {
    backgrounds: { default: "game" },
    docs: {
      description: {
        component:
          "All discovery tooltips rendered with the exact same HTML/CSS as the in-game toast from client-discovery-tip-overlay.ts. Copy changes to DISCOVERY_TIPS in client-discovery-tips.ts automatically update this story."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj;

export const AllTips: Story = {};
