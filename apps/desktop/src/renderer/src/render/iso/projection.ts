import type { Hex } from "@iwakura/contracts";
import { cornerOffset, hexToPixel, type Point } from "@iwakura/engine";

/**
 * Fixed isometric projection used by the field renderers.
 *
 * World space is the existing top-down hex space (`hexToPixel`). The projector
 * is a linear transform, so it can be inverted for pointer picking and movement.
 * `z` is height in world units and projects straight up the screen.
 */
export const ISO_X = Math.sqrt(3) / 2;
export const ISO_Y = 0.5;
export const ISO_HEIGHT = 0.82;

export interface IsoPoint {
  readonly x: number;
  readonly y: number;
}

export function projectPoint(point: Point, z = 0): IsoPoint {
  return {
    x: (point.x - point.y) * ISO_X,
    y: (point.x + point.y) * ISO_Y - z * ISO_HEIGHT,
  };
}

export function projectVector(x: number, y: number): IsoPoint {
  return { x: (x - y) * ISO_X, y: (x + y) * ISO_Y };
}

export function unprojectPoint(point: IsoPoint): Point {
  const x = point.x / ISO_X;
  const y = point.y / ISO_Y;
  return {
    x: (x + y) / 2,
    y: (y - x) / 2,
  };
}

/** Convert a screen-space direction into the equivalent top-down world direction. */
export function screenVectorToWorld(dx: number, dy: number): Point {
  return unprojectPoint({ x: dx, y: dy });
}

/** Convert a top-down world direction into the equivalent screen-space direction. */
export function worldVectorToScreen(dx: number, dy: number): IsoPoint {
  return projectVector(dx, dy);
}

export function projectHex(hex: Hex, size: number, z = 0): IsoPoint {
  return projectPoint(hexToPixel(hex, size), z);
}

export function projectHexCenter(hex: Hex, size: number): Point {
  return hexToPixel(hex, size);
}

/** Projected hex corners on a horizontal plane at `z`. */
export function projectHexCorners(hex: Hex, size: number, z = 0, inset = 0): IsoPoint[] {
  const center = hexToPixel(hex, size);
  const points: IsoPoint[] = [];
  for (let corner = 0; corner < 6; corner += 1) {
    const offset = cornerOffset(corner, size - inset);
    points.push(projectPoint({ x: center.x + offset.x, y: center.y + offset.y }, z));
  }
  return points;
}

/** Width of a projected hex, used for label offsets. */
export function projectedHexWidth(size: number): number {
  return Math.sqrt(3) * size * ISO_X * 2;
}

export function projectedHexHeight(size: number): number {
  return size * ISO_Y * 4;
}
