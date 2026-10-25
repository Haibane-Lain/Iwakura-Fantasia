import type { Hex } from "@iwakura/contracts";
import { hashString } from "@iwakura/engine";
import { Container, Graphics, Sprite } from "pixi.js";
import { tileHeight } from "./layout";
import { type IsoPoint, projectHex } from "./projection";
import { propTexture } from "./textures";

export interface PropOptions {
  scale?: number;
  variant?: number;
  alpha?: number;
}

export function addProp(
  layer: Container,
  kind: "tree" | "pine" | "bush" | "rock" | "crate" | "barrel" | "glow",
  point: IsoPoint,
  options: PropOptions = {},
): Sprite {
  const sprite = new Sprite(propTexture(kind, options.variant ?? 0));
  sprite.anchor.set(0.5, 0.94);
  sprite.position.set(point.x, point.y);
  const scale = options.scale ?? 0.58;
  sprite.scale.set(scale);
  if (options.alpha !== undefined) sprite.alpha = options.alpha;
  layer.addChild(sprite);
  return sprite;
}

export function addTileProp(
  layer: Container,
  kind: "tree" | "pine" | "bush" | "rock" | "crate" | "barrel" | "glow",
  hex: Hex,
  size: number,
  mapId: string,
  tileId: string,
  options: PropOptions = {},
): Sprite {
  const point = projectHex(hex, size, tileHeight(tileId));
  const seed = hashString(`${mapId}:prop:${hex.q}:${hex.r}:${kind}`);
  const jitter = 4;
  const jitterX = ((seed % (jitter * 2 + 1)) - jitter) * 0.7;
  const jitterY = ((Math.floor(seed / 13) % (jitter * 2 + 1)) - jitter) * 0.45;
  return addProp(
    layer,
    kind,
    { x: point.x + jitterX, y: point.y + jitterY },
    { ...options, variant: options.variant ?? seed % 3 },
  );
}

export interface FigureView {
  container: Container;
  body: Container;
  phase: number;
}

const SKIN = 0xc9a07a;
const INK = 0x080706;

function colorFromCss(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A small layered paper-doll figure. It is intentionally simple: cloak, head,
 * belt, and a weapon silhouette. The silhouette is what reads at map zoom.
 */
export function createFigure(
  palette: {
    cloak: string;
    trim: string;
    skin?: string;
    ink?: string;
    glow?: string;
  },
  options: { enemy?: boolean; companion?: boolean; seed?: string } = {},
): FigureView {
  const container = new Container();
  const body = new Container();
  const cloak = colorFromCss(palette.cloak, 0x3f5538);
  const trim = colorFromCss(palette.trim, 0xc9a35a);
  const skin = colorFromCss(palette.skin ?? "", SKIN);
  const ink = colorFromCss(palette.ink ?? "", INK);
  const glow = colorFromCss(palette.glow ?? "", trim);
  const seed = hashString(options.seed ?? `${palette.cloak}:${options.enemy ? "enemy" : "friend"}`);

  const shadow = new Graphics();
  shadow.ellipse(0, 0, 10, 4).fill({ color: 0x080706, alpha: 0.42 });
  container.addChild(shadow);

  const ring = new Graphics();
  const ringColor = options.enemy ? 0xb45a4f : options.companion ? 0x9fb37a : 0xe8c987;
  ring.ellipse(0, 0, 11, 4.4).stroke({ color: ringColor, width: 1.2, alpha: 0.9 });
  container.addChild(ring);

  const legs = new Graphics();
  legs.rect(-4, -11, 3, 10).fill({ color: ink, alpha: 0.9 });
  legs.rect(1, -11, 3, 10).fill({ color: ink, alpha: 0.9 });
  body.addChild(legs);

  const cloakShape = new Graphics();
  cloakShape
    .poly([-8, -10, -6, -27, 0, -32, 6, -27, 8, -10, 4, -7, -4, -7], true)
    .fill({ color: cloak })
    .stroke({ color: ink, width: 1.3 });
  body.addChild(cloakShape);

  const trimLine = new Graphics();
  trimLine.moveTo(-6, -13).lineTo(6, -13).stroke({ color: trim, width: 1.8, alpha: 0.95 });
  trimLine.moveTo(0, -28).lineTo(0, -13).stroke({ color: trim, width: 1, alpha: 0.55 });
  body.addChild(trimLine);

  const head = new Graphics();
  head.circle(0, -34, 5.3).fill({ color: skin }).stroke({ color: ink, width: 1.2 });
  if (options.enemy) {
    head.poly([-7, -36, 0, -44, 7, -36, 4, -31, -4, -31], true).fill({ color: ink, alpha: 0.95 });
    head.circle(-1.8, -35, 0.8).fill({ color: 0xe0b0aa });
    head.circle(2.2, -35, 0.8).fill({ color: 0xe0b0aa });
  } else {
    const hood = new Graphics();
    hood
      .poly([-6, -34, -5, -41, 0, -43, 5, -41, 6, -34, 2, -38, -2, -38], true)
      .fill({ color: shadeColor(cloak, -18) })
      .stroke({ color: ink, width: 1 });
    body.addChild(hood);
  }
  body.addChild(head);

  const weapon = new Graphics();
  if (options.enemy) {
    weapon.moveTo(7, -26).lineTo(12, -8).stroke({ color: 0x8e3d36, width: 2.2, alpha: 0.9 });
  } else {
    weapon.moveTo(-8, -24).lineTo(-12, -9).stroke({ color: 0x8d7b5c, width: 1.5, alpha: 0.85 });
    weapon.moveTo(-12, -9).lineTo(-10, -5).stroke({ color: trim, width: 1.5, alpha: 0.8 });
  }
  body.addChild(weapon);

  if (options.companion) {
    const charm = new Graphics();
    charm.circle(5, -19, 1.5).fill({ color: glow, alpha: 0.9 });
    body.addChild(charm);
  }

  body.pivot.set(0, 0);
  container.addChild(body);
  container.alpha = 1;
  return { container, body, phase: (seed % 360) * (Math.PI / 180) };
}

function shadeColor(color: number, amount: number): number {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (color & 0xff) + amount));
  return (r << 16) | (g << 8) | b;
}
