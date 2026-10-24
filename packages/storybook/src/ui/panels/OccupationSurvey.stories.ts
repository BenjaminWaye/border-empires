import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/client-steampunk-theme-style.css";
import { occupationSurveyController } from "@client/client-occupation-survey.js";

type Args = { resource: "TITANIUM" | "UMBRITE" | "GEMS"; offScreen: boolean };

const clues = {
  TITANIUM: { signature: "FERROUS_DUST", name: "Titanium", clue: "Ferrous dust" },
  UMBRITE: { signature: "BLACKWOOD_CANOPY", name: "Umbrite", clue: "Blackwood canopy" },
  GEMS: { signature: "REFRACTIVE_GROUND", name: "Crystal", clue: "Refractive ground" }
} as const;

const render = (args: Args): HTMLElement => {
  occupationSurveyController.beginCapture();
  occupationSurveyController.endCapture([]);
  occupationSurveyController.reconcile([]);
  const root = document.createElement("div");
  root.style.cssText = "min-height:90vh;background:var(--sp-iron-950);color:var(--sp-parchment-100);padding:28px;font:14px/1.6 var(--sp-font-body);box-sizing:border-box";
  const heading = document.createElement("h2");
  heading.textContent = "Occupation survey — actual game UI";
  root.appendChild(heading);
  const explanation = document.createElement("p");
  explanation.textContent = "Garrisoning a neutral town finds a nearby resource clue. The popup stays until you choose View survey or Got it, regardless of the camera position. This backdrop is a preview, not the game map.";
  explanation.style.maxWidth = "660px";
  root.appendChild(explanation);
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:12px;flex-wrap:wrap";
  root.appendChild(controls);
  const status = document.createElement("p");
  root.appendChild(status);
  let offScreen = args.offScreen;
  const project = () => offScreen
    ? { sx: -1000, sy: -1000 }
    : { sx: window.innerWidth / 2, sy: window.innerHeight * 0.62 };
  const sync = (): void => occupationSurveyController.sync(
    { camX: 10, camY: 10, camSubX: 0, camSubY: 0, selected: undefined }, project, 32, 16, 16
  );
  const replay = (outside: boolean): void => {
    offScreen = outside;
    occupationSurveyController.beginCapture();
    occupationSurveyController.endCapture([]);
    occupationSurveyController.reconcile([]);
    const clue = clues[args.resource];
    occupationSurveyController.record({
      id: `storybook-survey-${crypto.randomUUID()}`,
      type: "OCCUPATION_SURVEY",
      text: `${clue.clue} east of this town indicates likely ${clue.name}-bearing territory.`,
      surveyResource: args.resource, surveySignature: clue.signature,
      surveyX: 14, surveyY: 10, bearing: "east", distanceBand: "NEAR", confidence: "HIGH"
    });
    status.textContent = outside ? "Clue is outside the camera view." : "Clue is in the camera view.";
    sync();
  };
  occupationSurveyController.installViewHandler(() => {
    offScreen = false;
    status.textContent = "View survey moved the camera to the clue at (14, 10).";
    sync();
  });
  for (const [label, outside] of [["Show survey popup", false], ["Show with clue off-screen", true]] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText = "padding:10px 16px;background:var(--sp-leather-800);border:1px solid var(--sp-brass-700);color:var(--sp-parchment-100);border-radius:6px;cursor:pointer;font:inherit";
    button.addEventListener("click", () => replay(outside));
    controls.appendChild(button);
  }
  let mounted = false;
  const tick = (): void => {
    if (root.isConnected) {
      if (!mounted) { mounted = true; replay(args.offScreen); }
      sync();
    } else if (mounted) {
      occupationSurveyController.beginCapture();
      occupationSurveyController.endCapture([]);
      occupationSurveyController.reconcile([]);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return root;
};

const meta: Meta<Args> = {
  title: "UI/Panels/Occupation Survey",
  render,
  args: { resource: "TITANIUM", offScreen: false },
  argTypes: { resource: { control: "select", options: ["TITANIUM", "UMBRITE", "GEMS"] } },
  parameters: { layout: "fullscreen" }
};
export default meta;
type Story = StoryObj<Args>;
export const MapLabel: Story = { name: "Survey popup" };
export const OffScreenNotification: Story = { name: "Clue off-screen", args: { offScreen: true } };
export const Umbrite: Story = { args: { resource: "UMBRITE" } };
export const Crystal: Story = { args: { resource: "GEMS" } };
