import type { Hex } from "@iwakura/contracts";
import { hashString } from "@iwakura/engine";
import { type Container, Sprite } from "pixi.js";
import { tileHeight } from "./layout";
import { type IsoPoint, projectHex } from "./projection";
import { type PropTextureKind, propTexture } from "./textures";

export interface PropOptions {
  scale?: number;
  variant?: number;
  alpha?: number;
}

export function addProp(
  layer: Container,
  kind: PropTextureKind,
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
  kind: PropTextureKind,
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
