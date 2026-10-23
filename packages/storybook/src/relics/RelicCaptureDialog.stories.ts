import type { Meta, StoryObj } from "@storybook/html-vite";
import { NATURAL_WONDER_LABELS } from "@border-empires/shared";
import { createRelicCutaway } from "./relic-cutaway.js";
import type { RelicInstallation } from "./relic-underground-geometry.js";
import "./relic-capture-dialog.css";

type Args = { installation: RelicInstallation; ownerColor: string };
const COPY: Record<RelicInstallation, {
  subtitle: string; description: string; value: string; benefit: string; secondary: string;
}> = {
  WARPRESS: {
    subtitle: "Concordance armour works",
    description: "The ziggurat is only the entrance. Beneath it, an automated armour line has survived the fall of the Concordance. Its surviving machinery can equip your mustering forces.",
    value: "2×", benefit: "Mustering speed", secondary: "+1 muster flag · 6 in total"
  },
  CALCULATING_ENGINE: {
    subtitle: "Concordance computation vault",
    description: "The ziggurat is only the entrance. Beneath it, banks of Concordance calculating machinery still function. Their recovered calculations reduce the coin needed for your research.",
    value: "−10%", benefit: "Research coin costs", secondary: "Applies to technology research"
  }
};

const render = (args: Args): HTMLElement => {
  const copy = COPY[args.installation];
  const name = NATURAL_WONDER_LABELS[args.installation].name.replace(/^the /, "The ");
  const cutaway = createRelicCutaway(args.installation, args.ownerColor);
  const root = document.createElement("div");
  root.className = "relic-capture-preview-page";
  root.innerHTML = `<div class="relic-preview-bar"><span>RELICS / CAPTURE DIALOG</span><span>Design preview</span></div>
    <div class="relic-preview-map" aria-hidden="true"><div class="relic-preview-grid"></div></div>
    <button class="relic-dialog-reopen" type="button">Show capture dialog</button>
    <p class="relic-preview-note">Proposed relic fiction · current gameplay benefits · isolated Storybook preview</p>`;
  const dialog = document.createElement("dialog");
  dialog.className = "relic-capture-dialog";
  const titleId = `relic-capture-title-${args.installation.toLowerCase()}`;
  dialog.setAttribute("aria-labelledby", titleId);
  dialog.innerHTML = `<header class="relic-dialog-header">
      <div class="relic-dialog-status"><i aria-hidden="true"></i>RELIC SECURED</div>
      <button class="relic-dialog-close" type="button" aria-label="Close capture dialog">×</button>
      <h1 id="${titleId}">${name}</h1>
      <p>${copy.subtitle}</p>
    </header>
    <figure class="relic-dialog-figure">
      <div class="relic-dialog-figure-toolbar"><span>INSTALLATION CROSS-SECTION</span>
        <button class="relic-section-toggle" type="button" aria-pressed="true"><i aria-hidden="true"></i>Cutaway view</button>
      </div>
      <div class="relic-figure-mount"></div>
      <figcaption><span class="relic-figure-key"><i></i>Surface remnant</span><span class="relic-figure-key relic-figure-key--buried"><i></i>Buried installation</span><span>Illustrative section · not to scale</span></figcaption>
    </figure>
    <div class="relic-dialog-copy"><p>${copy.description}</p></div>
    <section class="relic-dialog-benefit" aria-label="Relic benefit">
      <div class="relic-benefit-number">${copy.value}</div>
      <div class="relic-benefit-detail"><span>WHILE YOU HOLD THIS RELIC</span><strong>${copy.benefit}</strong><p>${copy.secondary}</p></div>
    </section>
    <footer class="relic-dialog-footer"><p>The benefit remains active while you control the relic.</p><button class="relic-dialog-continue" type="button" autofocus>Continue <span aria-hidden="true">→</span></button></footer>`;
  dialog.querySelector(".relic-figure-mount")?.append(cutaway.element);
  const toggle = dialog.querySelector<HTMLButtonElement>(".relic-section-toggle");
  toggle?.addEventListener("click", () => {
    const visible = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(visible));
    cutaway.setSection(visible);
  });
  const reopen = root.querySelector<HTMLButtonElement>(".relic-dialog-reopen");
  const close = (): void => { dialog.close(); };
  dialog.addEventListener("close", () => reopen?.focus());
  dialog.querySelector(".relic-dialog-close")?.addEventListener("click", close);
  dialog.querySelector(".relic-dialog-continue")?.addEventListener("click", close);
  reopen?.addEventListener("click", () => dialog.showModal());
  root.append(dialog);
  // Native focus trapping and Escape; return focus to the launcher on close.
  requestAnimationFrame(() => { if (dialog.isConnected && !dialog.open) dialog.showModal(); });
  return root;
};

const meta: Meta<Args> = {
  title: "Relics/Capture Dialog",
  parameters: { layout: "fullscreen" },
  args: { installation: "WARPRESS", ownerColor: "#3d7fd6" },
  argTypes: {
    installation: { control: "radio", options: ["WARPRESS", "CALCULATING_ENGINE"] },
    ownerColor: { control: "color" }
  },
  render
};
export default meta;
type Story = StoryObj<Args>;
export const ArmourWorks: Story = {};
export const ComputationVault: Story = { args: { installation: "CALCULATING_ENGINE" } };
