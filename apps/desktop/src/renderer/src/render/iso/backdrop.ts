import type { Application, Graphics } from "pixi.js";

export type BackdropKind = "wilderness" | "town" | "dungeon";

function palette(kind: BackdropKind): { base: number; glow: number; rim: number } {
  if (kind === "dungeon") return { base: 0x090807, glow: 0x17130f, rim: 0x241d16 };
  if (kind === "town") return { base: 0x17150f, glow: 0x2b2519, rim: 0x3a3020 };
  return { base: 0x0d130d, glow: 0x202b1a, rim: 0x334028 };
}

/**
 * A screen-space atmospheric wash behind the isometric scene. It keeps map
 * edges from ending in a flat black rectangle and gives each map type its own
 * ambient colour without another full-screen filter.
 */
export function drawBackdrop(app: Application, graphics: Graphics, kind: BackdropKind, hour = 12): void {
  const width = app.screen.width;
  const height = app.screen.height;
  const colors = palette(kind);
  const night = hour < 6 || hour >= 20;
  const dusk = (hour >= 17 && hour < 20) || (hour >= 5 && hour < 7);
  const base = night ? 0x070807 : dusk ? 0x120f0c : colors.base;
  const glow = night ? 0x111a19 : dusk ? 0x38271b : colors.glow;

  graphics.clear();
  graphics.rect(0, 0, width, height).fill({ color: base });
  graphics
    .ellipse(width * 0.48, height * 0.4, width * 0.62, height * 0.58)
    .fill({ color: glow, alpha: night ? 0.36 : 0.28 });
  graphics
    .ellipse(width * 0.56, height * 0.34, width * 0.34, height * 0.3)
    .fill({ color: colors.rim, alpha: night ? 0.12 : 0.16 });
  graphics
    .ellipse(width * 0.5, height * 0.56, width * 0.54, height * 0.46)
    .fill({ color: 0x050604, alpha: 0.28 });
}
