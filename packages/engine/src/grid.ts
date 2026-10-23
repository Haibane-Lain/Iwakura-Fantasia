import type { Hex } from "@iwakura/contracts";

export interface Offset {
  readonly col: number;
  readonly row: number;
}

/** Pointy-top odd-r offset to axial. */
export function offsetToAxial(offset: Offset): Hex {
  return { q: offset.col - Math.floor(offset.row / 2), r: offset.row };
}

/** Axial to pointy-top odd-r offset. */
export function axialToOffset(hex: Hex): Offset {
  return { col: hex.q + Math.floor(hex.r / 2), row: hex.r };
}

export function inBounds(width: number, height: number, offset: Offset): boolean {
  return offset.col >= 0 && offset.col < width && offset.row >= 0 && offset.row < height;
}

export function offsetIndex(width: number, offset: Offset): number {
  return offset.row * width + offset.col;
}

export function indexFromOffset(width: number, height: number, offset: Offset): number {
  return inBounds(width, height, offset) ? offsetIndex(width, offset) : -1;
}

export function offsetFromIndex(width: number, index: number): Offset {
  return { col: index % width, row: Math.floor(index / width) };
}

export function axialIndex(width: number, height: number, hex: Hex): number {
  return indexFromOffset(width, height, axialToOffset(hex));
}

export function hexesInWorldRadius(
  width: number,
  height: number,
  center: Hex,
  radius: number,
): Array<{ hex: Hex; offset: Offset; index: number }> {
  const result: Array<{ hex: Hex; offset: Offset; index: number }> = [];
  const c = axialToOffset(center);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const offset = { col: c.col + dx, row: c.row + dy };
      if (!inBounds(width, height, offset)) continue;
      const hex = offsetToAxial(offset);
      // Hex distance in axial space.
      const dist =
        (Math.abs(hex.q - center.q) +
          Math.abs(hex.q + hex.r - center.q - center.r) +
          Math.abs(hex.r - center.r)) /
        2;
      if (dist <= radius) result.push({ hex, offset, index: offsetIndex(width, offset) });
    }
  }
  return result;
}
