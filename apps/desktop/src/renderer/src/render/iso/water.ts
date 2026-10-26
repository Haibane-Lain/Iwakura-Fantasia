import type { LocalMap } from "@iwakura/contracts";
import { cornerOffset, hexToPixel, localTileAt, neighbor } from "@iwakura/engine";
import { Graphics, type Texture } from "pixi.js";
import { projectPoint } from "./projection";

interface WaterEntry {
  texture: Texture;
  phase: number;
  speed: number;
}

/**
 * Scrolls water texture matrices. This uses the mesh texture matrix rather
 * than per-frame geometry uploads, so even large fields animate cheaply.
 */
export class WaterAnimator {
  private readonly entries = new Map<Texture, WaterEntry>();

  register(texture: Texture, phase = 0): void {
    if (this.entries.has(texture)) return;
    texture.source.addressMode = "repeat";
    this.entries.set(texture, { texture, phase, speed: 0.75 + ((phase * 7) % 1) * 0.5 });
  }

  update(elapsedMS: number, reduceMotion: boolean): void {
    const seconds = elapsedMS / 1000;
    for (const entry of this.entries.values()) {
      const matrix = entry.texture.textureMatrix;
      const motion = reduceMotion ? 0 : 1;
      matrix.mapCoord.tx = Math.sin(seconds * 0.12 * entry.speed + entry.phase) * 0.026 * motion;
      matrix.mapCoord.ty =
        (seconds * 0.02 * entry.speed + Math.cos(seconds * 0.09 + entry.phase) * 0.012) * motion;
      matrix._updateID += 1;
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Foam line along every water/land boundary, drawn just above the water. */
export function createShoreline(map: LocalMap, size: number): Graphics {
  const shoreline = new Graphics();
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const hex = { q: col - Math.floor(row / 2), r: row };
      if (localTileAt(map, hex) !== "water") continue;
      const center = hexToPixel(hex, size);
      for (let direction = 0; direction < 6; direction += 1) {
        if (localTileAt(map, neighbor(hex, direction)) === "water") continue;
        const a = cornerOffset(direction, size);
        const b = cornerOffset((direction + 1) % 6, size);
        const from = projectPoint({ x: center.x + a.x, y: center.y + a.y }, 0.04);
        const to = projectPoint({ x: center.x + b.x, y: center.y + b.y }, 0.04);
        shoreline
          .moveTo(from.x, from.y)
          .lineTo(to.x, to.y)
          .stroke({ color: 0xb7d9d8, width: 3.4, alpha: 0.12 });
        shoreline
          .moveTo(from.x, from.y)
          .lineTo(to.x, to.y)
          .stroke({ color: 0xe1efeb, width: 1.2, alpha: 0.28 });
      }
    }
  }
  return shoreline;
}
