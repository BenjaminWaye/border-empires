import type { Meta, StoryObj } from "@storybook/html-vite";
import { dukeStatus, dukeSystem } from "@client/client-duke-panel/client-duke-fixtures.js";
import { mountDukeController } from "@client/client-duke-panel/client-duke-panel.js";
import { dukeStyle } from "@client/client-duke-panel/client-duke-style.js";
import { spaceViewChromeHtml, spaceViewStatsHtml, spaceViewStyle } from "@client/client-space-view/client-space-view-html.js";
import { mountPanelDismissal } from "@client/client-space-view/client-space-view-panels.js";

// A small stand-in for the Space View screen: the REAL top-bar HTML, the REAL
// Duke controller/panel and the REAL dismissal handling, driven by a fake API.
// Only the map/scene is a placeholder, and the button wiring below mirrors
// client-space-view.ts (Court/Log -> showTab, planet press -> showSystem,
// one map button that relabels itself).
const FRAME_STYLE = `
.sb-sv-frame{position:relative;width:min(900px,100%);height:640px;border-radius:12px;overflow:hidden;font-family:system-ui,sans-serif}
.sb-sv-frame .sv-screen{position:absolute;inset:0}
.sb-sv-stage{position:absolute;inset:56px 0 0 0;z-index:0;background:radial-gradient(ellipse at center,#1a1206 0%,#050302 75%);color:#b9926a;font-size:13px}
.sb-sv-stage.sb-map{background:#0a0a14}
.sb-sv-planet{position:absolute;border-radius:50%;border:0;cursor:pointer;color:#fff;font-size:11px;background:radial-gradient(circle at 35% 35%,#e0a95a,#6b3f14)}
.sb-sv-hint{position:absolute;left:16px;bottom:12px}
`;

const status = dukeStatus({
  systems: [dukeSystem(), dukeSystem({ seasonId: "s2", label: "Vex", specialization: "TRADE" })],
  court: { ...dukeStatus().court, offer: { status: "PENDING", protectedUntil: null, moveLockedUntil: null } }
});

const render = (): HTMLElement => {
  const style = document.createElement("style");
  style.textContent = spaceViewStyle + dukeStyle + FRAME_STYLE;
  document.head.appendChild(style);

  const frame = document.createElement("div");
  frame.className = "sb-sv-frame";
  frame.innerHTML = `<div class="sv-screen">${spaceViewChromeHtml(spaceViewStatsHtml(status.influence, "8/day"))}
    <div class="sb-sv-stage" data-stage>
      <button class="sb-sv-planet" style="left:22%;top:38%;width:64px;height:64px" data-planet="s1">Aurelia</button>
      <button class="sb-sv-planet" style="left:60%;top:55%;width:52px;height:52px" data-planet="s2">Vex</button>
      <span class="sb-sv-hint" data-hint>3D galaxy: press a planet, or use Court / Log.</span>
    </div></div>`;
  const screen = frame.querySelector<HTMLElement>(".sv-screen")!;
  const panel = screen.querySelector<HTMLElement>("[data-space-view-duke-panel]")!;
  const stage = screen.querySelector<HTMLElement>("[data-stage]")!;
  const mapButton = screen.querySelector<HTMLButtonElement>("[data-space-view-strategic-map]")!;
  mountPanelDismissal(screen);

  const controller = mountDukeController(screen, panel, {
    wsUrl: "wss://example.test",
    getIdToken: async () => "t",
    getTargetOptions: () => [{ seasonId: "s9", label: "Kel" }],
    openPanel: () => {
      panel.hidden = false;
    },
    refreshIntervalMs: 3_600_000,
    onStatus: (s) => {
      const court = screen.querySelector<HTMLButtonElement>("[data-space-view-court]")!;
      court.toggleAttribute("data-alert", !!s && s.court.offer.status === "PENDING");
    },
    api: {
      fetchStatus: async () => ({ status }),
      build: async () => ({ ok: true }),
      cancelBuild: async () => ({ ok: true }),
      order: async () => ({ ok: true }),
      answerOffer: async () => ({ ok: true }),
      moveAgainstCourt: async () => ({ ok: true })
    }
  });
  void controller.refresh();

  let mapOpen = false;
  frame.addEventListener("click", (event) => {
    const t = event.target as HTMLElement;
    const planet = t.closest<HTMLElement>("[data-planet]");
    if (planet) return controller.showSystem(planet.dataset.planet!);
    if (t.closest("[data-space-view-court]")) return controller.showTab("COURT");
    if (t.closest("[data-space-view-log]")) return controller.showTab("LOG");
    if (t.closest("[data-space-view-strategic-map]")) {
      mapOpen = !mapOpen;
      mapButton.textContent = mapOpen ? "🌌 Galaxy View" : "🗺 Strategic Map";
      stage.classList.toggle("sb-map", mapOpen);
      stage.querySelector("[data-hint]")!.textContent = mapOpen ? "Flat strategic map. Press Galaxy View to fly back out." : "3D galaxy: press a planet, or use Court / Log.";
    }
  });
  return frame;
};

const meta: Meta = {
  title: "UI/Space View Duke Buttons",
  parameters: {
    backgrounds: { default: "game" },
    docs: {
      description: {
        component:
          "Planet opens by pressing a planet; Court and Log are separate top-bar buttons (Court shows a red dot while the Court's offer or a Petition is waiting); the panel has no tab bar, just a title. One map button flips between Strategic Map and Galaxy View. Real chrome, panel and dismissal code; fake API and placeholder scene."
      }
    }
  }
};
export default meta;
type Story = StoryObj;

export const Interactive: Story = { render };
