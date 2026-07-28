import type { Meta, StoryObj } from "@storybook/html-vite";
import { DISCOVERY_TIPS, type DiscoveryTipId } from "@client/client-discovery-tips/client-discovery-tips.js";

const ALL_IDS: DiscoveryTipId[] = ["TOWN", "DOCK", "BARBARIAN", "FOOD", "IRON", "CRYSTAL", "SUPPLY"];

const TIP_ICONS: Record<DiscoveryTipId, string> = {
  TOWN: "🏛",
  DOCK: "⚓",
  BARBARIAN: "💀",
  FOOD: "🌾",
  IRON: "⛏",
  CRYSTAL: "💎",
  SUPPLY: "🪵"
};

const TIP_TAGS: Record<DiscoveryTipId, string> = {
  TOWN: "Capture & settle",
  DOCK: "Maritime routes",
  BARBARIAN: "Clear & expand",
  FOOD: "Settle to collect",
  IRON: "Settle to collect",
  CRYSTAL: "Settle to collect",
  SUPPLY: "Settle to collect"
};

const render = (): HTMLElement => {
  const container = document.createElement("div");
  container.style.padding = "28px";
  container.style.display = "grid";
  container.style.gap = "16px";
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.maxWidth = "700px";

  const header = document.createElement("h1");
  header.style.margin = "0 0 4px 0";
  header.style.color = "#ffd68f";
  header.style.fontSize = "16px";
  header.style.fontWeight = "800";
  header.style.letterSpacing = "-0.01em";
  header.textContent = "Discovery Tooltips";
  container.appendChild(header);

  const subtitle = document.createElement("p");
  subtitle.style.margin = "0 0 8px 0";
  subtitle.style.color = "rgba(201, 216, 236, 0.6)";
  subtitle.style.fontSize = "12.5px";
  subtitle.style.lineHeight = "1.5";
  subtitle.textContent = "Shown the first time a player discovers each type of tile. Source: client-discovery-tips.ts → DISCOVERY_TIPS";
  container.appendChild(subtitle);

  for (const id of ALL_IDS) {
    const tip = DISCOVERY_TIPS[id];
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.gap = "14px";
    card.style.padding = "14px 16px";
    card.style.borderRadius = "14px";
    card.style.border = "1px solid rgba(230, 178, 106, 0.32)";
    card.style.background = "linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98))";
    card.style.boxShadow = "0 18px 48px rgba(0,0,0,0.45), 0 0 40px rgba(214,150,68,0.12)";
    card.style.color = "#fbf3e6";
    card.style.alignItems = "flex-start";

    const iconEl = document.createElement("div");
    iconEl.style.fontSize = "24px";
    iconEl.style.lineHeight = "1";
    iconEl.style.marginTop = "1px";
    iconEl.textContent = TIP_ICONS[id];
    card.appendChild(iconEl);

    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gap = "4px";
    body.style.flex = "1";

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "10px";

    const titleEl = document.createElement("div");
    titleEl.style.fontSize = "14px";
    titleEl.style.fontWeight = "800";
    titleEl.style.letterSpacing = "-0.01em";
    titleEl.style.color = "#ffd68f";
    titleEl.textContent = tip.title;
    titleRow.appendChild(titleEl);

    const tagEl = document.createElement("span");
    tagEl.style.fontSize = "10px";
    tagEl.style.fontWeight = "600";
    tagEl.style.textTransform = "uppercase";
    tagEl.style.letterSpacing = "0.06em";
    tagEl.style.padding = "2px 7px";
    tagEl.style.borderRadius = "999px";
    tagEl.style.background = "rgba(214, 150, 68, 0.18)";
    tagEl.style.border = "1px solid rgba(214, 150, 68, 0.25)";
    tagEl.style.color = "#e6b06c";
    tagEl.textContent = TIP_TAGS[id];
    titleRow.appendChild(tagEl);

    body.appendChild(titleRow);

    const bodyEl = document.createElement("p");
    bodyEl.style.margin = "0";
    bodyEl.style.fontSize = "12.5px";
    bodyEl.style.lineHeight = "1.5";
    bodyEl.style.color = "rgba(240, 224, 200, 0.86)";
    bodyEl.textContent = tip.body;
    body.appendChild(bodyEl);

    card.appendChild(body);
    container.appendChild(card);
  }

  return container;
};

const meta: Meta = {
  title: "UI/Discovery Tips",
  parameters: {
    docs: {
      description: {
        component:
          "All discovery tooltips rendered from DISCOVERY_TIPS in client-discovery-tips.ts. Copy changes to that module automatically update this story. Each tip shows once per account per 30-day/season window, with a global mute checkbox."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj;

export const AllTips: Story = {};
