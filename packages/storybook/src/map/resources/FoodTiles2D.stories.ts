import type { Meta, StoryObj } from "@storybook/html-vite";

const meta: Meta = {
  title: "Map/Resources/Food tiles 2D",
  render: () => {
    const page = document.createElement("div");
    page.style.cssText = "padding:32px;background:#202c29;color:#e4dfca;font:15px system-ui;min-height:85vh";
    page.innerHTML = `<h2 style="font-weight:500">Food tiles · 2D fallback</h2>
      <p>Farm and fishing scenes at detail and gameplay scales.</p>
      ${["farm", "fish"].map((kind) => `<div style="display:flex;gap:24px;margin:32px 0;align-items:center">
        ${[1, 2, 3].map((variant) => `<div style="background:#536448;border:1px solid #7b8767;padding:8px">
          <img width="160" height="160" alt="${kind} variant ${variant}" src="/overlays/${kind}-overlay-${variant}.svg"></div>`).join("")}
        <div style="display:flex;background:#536448;padding:8px">${[1, 2, 3].map((variant) => `<img width="48" height="48" alt="${kind} at map scale" src="/overlays/${kind}-overlay-${variant}.svg">`).join("")}</div>
      </div>`).join("")}`;
    return page;
  }
};
export default meta;
type Story = StoryObj;
export const FoodTiles: Story = {};
