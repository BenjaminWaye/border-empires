import type { StoryObj } from "@storybook/web-components";
import { html } from "lit";

const meta = {
  title: "3D Map/Waypoint Markers",
  parameters: {
    layout: "centered"
  }
};

export default meta;

export const WaypointStates: StoryObj = {
  render: () => html`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; max-width: 900px;">
      <h1 style="font-size: 24px; margin-bottom: 2rem; color: #1f2937;">Waypoint Queue Visualization</h1>

      <svg viewBox="0 0 900 550" xmlns="http://www.w3.org/2000/svg" style="background: linear-gradient(135deg, #1a472a 0%, #0d2819 100%); border-radius: 12px; width: 100%; max-width: 100%; display: block;">
        <!-- Map grid pattern -->
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a5e3a" stroke-width="0.5"/>
          </pattern>
        </defs>
        <rect width="900" height="550" fill="url(#grid)"/>

        <!-- WAYPOINT 1: ACTIVE (Bright) -->
        <g>
          <!-- Glow -->
          <circle cx="180" cy="180" r="65" fill="#2563eb" opacity="0.25"/>
          <circle cx="180" cy="180" r="55" fill="#3b82f6" opacity="0.35"/>

          <!-- Post -->
          <rect x="169" y="160" width="22" height="70" fill="#8b6d47" opacity="0.95"/>

          <!-- Flag structure -->
          <g>
            <!-- Backing -->
            <rect x="140" y="110" width="80" height="60" rx="4" fill="#8b6d47" opacity="0.85"/>

            <!-- Banner -->
            <rect x="147" y="118" width="66" height="45" rx="3" fill="#3b82f6" opacity="0.98"/>

            <!-- Emblem -->
            <circle cx="180" cy="138" r="9" fill="#fbbf24" opacity="0.95"/>
            <circle cx="180" cy="138" r="7" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.8"/>
          </g>

          <!-- Label -->
          <text x="180" y="280" text-anchor="middle" style="font-size: 15px; font-weight: 600; fill: #10b981;">Waypoint 1: Active</text>
          <text x="180" y="302" text-anchor="middle" style="font-size: 13px; fill: #d1d5db;">Bright colors, full glow</text>
        </g>

        <!-- WAYPOINT 2: QUEUED (Dimmed) -->
        <g>
          <!-- Subtle glow -->
          <circle cx="450" cy="220" r="65" fill="#4b5563" opacity="0.12"/>
          <circle cx="450" cy="220" r="55" fill="#6b7280" opacity="0.18"/>

          <!-- Post -->
          <rect x="439" y="200" width="22" height="70" fill="#8b6d47" opacity="0.55"/>

          <!-- Flag structure (grayscale) -->
          <g>
            <!-- Backing -->
            <rect x="410" y="150" width="80" height="60" rx="4" fill="#8b6d47" opacity="0.5"/>

            <!-- Banner -->
            <rect x="417" y="158" width="66" height="45" rx="3" fill="#6b7280" opacity="0.65"/>

            <!-- Emblem -->
            <circle cx="450" cy="178" r="9" fill="#9ca3af" opacity="0.5"/>
            <circle cx="450" cy="178" r="7" fill="none" stroke="#d1d5db" stroke-width="1" opacity="0.4"/>
          </g>

          <!-- Queue number badge -->
          <circle cx="490" cy="155" r="16" fill="#4b5563" opacity="0.85"/>
          <text x="490" y="164" text-anchor="middle" style="font-size: 14px; font-weight: 700; fill: #f3f4f6;">2</text>

          <!-- Label -->
          <text x="450" y="320" text-anchor="middle" style="font-size: 15px; font-weight: 600; fill: #9ca3af;">Waypoint 2: Queued</text>
          <text x="450" y="342" text-anchor="middle" style="font-size: 13px; fill: #6b7280;">Dimmed, grayscale, numbered</text>
        </g>

        <!-- WAYPOINT 3: QUEUED (More Dimmed) -->
        <g>
          <!-- Very subtle glow -->
          <circle cx="720" cy="280" r="65" fill="#374151" opacity="0.08"/>
          <circle cx="720" cy="280" r="55" fill="#4b5563" opacity="0.12"/>

          <!-- Post -->
          <rect x="709" y="260" width="22" height="70" fill="#8b6d47" opacity="0.4"/>

          <!-- Flag structure (very faded) -->
          <g>
            <!-- Backing -->
            <rect x="680" y="210" width="80" height="60" rx="4" fill="#8b6d47" opacity="0.35"/>

            <!-- Banner -->
            <rect x="687" y="218" width="66" height="45" rx="3" fill="#4b5563" opacity="0.48"/>

            <!-- Emblem -->
            <circle cx="720" cy="238" r="9" fill="#6b7280" opacity="0.35"/>
            <circle cx="720" cy="238" r="7" fill="none" stroke="#9ca3af" stroke-width="1" opacity="0.25"/>
          </g>

          <!-- Queue number badge -->
          <circle cx="760" cy="215" r="16" fill="#374151" opacity="0.65"/>
          <text x="760" y="224" text-anchor="middle" style="font-size: 14px; font-weight: 700; fill: #9ca3af;">3</text>

          <!-- Label -->
          <text x="720" y="380" text-anchor="middle" style="font-size: 15px; font-weight: 600; fill: #6b7280;">Waypoint 3: Queued</text>
          <text x="720" y="402" text-anchor="middle" style="font-size: 13px; fill: #4b5563;">More dimmed, faded grayscale</text>
        </g>

        <!-- Path connecting waypoints -->
        <defs>
          <linearGradient id="pathGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.7" />
            <stop offset="50%" style="stop-color:#6b7280;stop-opacity:0.4" />
            <stop offset="100%" style="stop-color:#4b5563;stop-opacity:0.2" />
          </linearGradient>
        </defs>
        <path d="M 195 195 Q 320 205 435 215" stroke="url(#pathGrad)" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M 465 235 Q 590 255 705 270" stroke="url(#pathGrad)" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.6"/>

        <!-- Legend at bottom -->
        <text x="45" y="520" style="font-size: 12px; fill: #9ca3af; font-weight: 500;">Key: Active waypoint (1) shown in full color • Queued waypoints (2, 3) progressively dimmed and grayscaled • Numbers show execution order</text>
      </svg>

      <div style="margin-top: 2rem; padding: 1.5rem; background: #1f2937; border-radius: 8px; border: 1px solid #374151;">
        <h2 style="font-size: 16px; margin-top: 0; margin-bottom: 1rem; color: #f3f4f6;">Design details:</h2>
        <ul style="margin: 0; padding-left: 1.5rem; color: #d1d5db; line-height: 1.8;">
          <li><strong style="color: #f3f4f6;">Active (Waypoint 1):</strong> Bright blue (#3b82f6), full glow effect, gold emblem. Player knows exactly where they're going.</li>
          <li><strong style="color: #f3f4f6;">Queued (Waypoints 2+):</strong> Grayscale, dimmed opacity, subtle glow. Clearly secondary but still visible on the map.</li>
          <li><strong style="color: #f3f4f6;">Queue numbers:</strong> Badge showing position in queue (2, 3, etc.). Easy to see order at a glance.</li>
          <li><strong style="color: #f3f4f6;">Progressive fading:</strong> Each additional waypoint is slightly more dimmed, so you know which is closest/next.</li>
        </ul>
      </div>
    </div>
  `
};

export const ActiveWaypointOnly: StoryObj = {
  render: () => html`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem;">
      <h2 style="font-size: 18px; margin-bottom: 1rem; color: #f3f4f6;">Single active waypoint</h2>
      <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" style="background: linear-gradient(135deg, #1a472a 0%, #0d2819 100%); border-radius: 12px; width: 100%; max-width: 300px; display: block;">
        <defs>
          <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a5e3a" stroke-width="0.5"/>
          </pattern>
        </defs>
        <rect width="300" height="300" fill="url(#grid2)"/>

        <g>
          <circle cx="150" cy="120" r="60" fill="#2563eb" opacity="0.25"/>
          <circle cx="150" cy="120" r="50" fill="#3b82f6" opacity="0.35"/>
          <rect x="140" y="105" width="20" height="60" fill="#8b6d47" opacity="0.95"/>
          <rect x="115" y="65" width="70" height="50" rx="4" fill="#8b6d47" opacity="0.85"/>
          <rect x="122" y="73" width="56" height="40" rx="3" fill="#3b82f6" opacity="0.98"/>
          <circle cx="150" cy="93" r="8" fill="#fbbf24" opacity="0.95"/>
        </g>
      </svg>
    </div>
  `
};

export const MultipleQueuedWaypoints: StoryObj = {
  render: () => html`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem;">
      <h2 style="font-size: 18px; margin-bottom: 1rem; color: #f3f4f6;">Queue progression (1 active → 4 queued)</h2>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem;">
        ${[
          { num: 1, active: true, color: "#3b82f6", opacity: 0.98, label: "Active" },
          { num: 2, active: false, color: "#6b7280", opacity: 0.65, label: "Queued #2" },
          { num: 3, active: false, color: "#4b5563", opacity: 0.48, label: "Queued #3" },
          { num: 4, active: false, color: "#4b5563", opacity: 0.38, label: "Queued #4" },
          { num: 5, active: false, color: "#374151", opacity: 0.28, label: "Queued #5" }
        ].map(
          (wp) => html`
            <div style="text-align: center;">
              <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="background: linear-gradient(135deg, #1a472a 0%, #0d2819 100%); border-radius: 8px; width: 100%; display: block; margin-bottom: 8px;">
                <defs>
                  <pattern id="grid${wp.num}" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a5e3a" stroke-width="0.5"/>
                  </pattern>
                </defs>
                <rect width="120" height="120" fill="url(#grid${wp.num})"/>
                <g>
                  ${wp.active ? html`<circle cx="60" cy="50" r="32" fill="#2563eb" opacity="0.25"/>` : ""}
                  <circle cx="60" cy="50" r="28" fill="${wp.color}" opacity="${wp.opacity * 0.4}"/>
                  <rect x="54" y="40" width="12" height="35" fill="#8b6d47" opacity="${wp.opacity * 0.8}"/>
                  <rect x="38" y="28" width="44" height="30" rx="2" fill="#8b6d47" opacity="${wp.opacity * 0.6}"/>
                  <rect x="43" y="32" width="34" height="23" rx="2" fill="${wp.color}" opacity="${wp.opacity}"/>
                  <circle cx="60" cy="43" r="5" fill="${wp.active ? "#fbbf24" : "#9ca3af"}" opacity="${wp.opacity * 0.9}"/>
                  ${!wp.active ? html`<circle cx="77" cy="25" r="10" fill="#374151" opacity="0.7"/><text x="77" y="32" text-anchor="middle" style="font-size: 9px; font-weight: bold; fill: #d1d5db;">${wp.num}</text>` : ""}
                </g>
              </svg>
              <div style="font-size: 12px; font-weight: 500; color: #f3f4f6;">${wp.label}</div>
              <div style="font-size: 11px; color: #9ca3af;">opacity ${Math.round(wp.opacity * 100)}%</div>
            </div>
          `
        )}
      </div>
    </div>
  `
};
