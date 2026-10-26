import type { Hex, LocalMap } from "@iwakura/contracts";
import { hashString } from "@iwakura/engine";
import { type IsoPoint, projectHex, projectHexCorners } from "./projection";

const WATER_HEIGHT = 0;

/** Visual height, in hex-radius units, for a local/wilderness tile. */
export function tileHeight(tileId: string): number {
  switch (tileId) {
    case "water":
      return WATER_HEIGHT;
    case "stairs":
      return 0.12;
    case "bridge":
      return 0.07;
    case "high_ground":
      return 0.24;
    case "rock":
      return 0.34;
    case "cliff":
      return 0.62;
    case "stone_wall":
      return 0.78;
    case "roof":
      return 0.04;
    case "crate":
    case "altar":
      return 0.02;
    default:
      return 0;
  }
}

/** Stable per-tile texture variant. */
export function tileVariant(mapId: string, hex: Hex, tileId: string): number {
  return hashString(`${mapId}:tile:${hex.q}:${hex.r}:${tileId}`) % 4;
}

export interface IsoBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function mapIsoBounds(map: LocalMap, size: number, margin = 90): IsoBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const hex = { q: col - Math.floor(row / 2), r: row };
      const points = projectHexCorners(hex, size, 0, -1);
      for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin * 1.8,
    maxY: maxY + margin,
  };
}

export function projectedCenter(hex: Hex, size: number): IsoPoint {
  return projectHex(hex, size);
}

/** Warm/cool ambient wash used to match the campaign clock. */
export function timeTint(hour: number): { color: number; alpha: number; blend: "normal" | "multiply" } {
  if (hour >= 5 && hour < 7) return { color: 0xd58b5b, alpha: 0.12, blend: "normal" };
  if (hour >= 7 && hour < 17) return { color: 0xfff1d2, alpha: 0.035, blend: "normal" };
  if (hour >= 17 && hour < 20) return { color: 0xc76b49, alpha: 0.16, blend: "normal" };
  if (hour >= 20 && hour < 23) return { color: 0x24304c, alpha: 0.22, blend: "multiply" };
  return { color: 0x182038, alpha: 0.3, blend: "multiply" };
}
