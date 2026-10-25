import { getLocalTile } from "@iwakura/content";
import type { Hex, LocalMap } from "@iwakura/contracts";
import { findPath, hexKey, localTileAt, neighbor } from "@iwakura/engine";

const ROAD_TILES = new Set(["road", "bridge"]);
const PAVED_TILES = new Set(["road", "bridge", "plaza", "door", "stone_door", "stairs"]);

export interface RoadSegment {
  from: Hex;
  to: Hex;
  bridge: boolean;
}

function segmentKey(from: Hex, to: Hex): string {
  const a = hexKey(from);
  const b = hexKey(to);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function roadCost(map: LocalMap) {
  return (hex: Hex): number | null => {
    const tile = localTileAt(map, hex);
    const definition = getLocalTile(tile);
    if (!definition.walkable) return null;
    if (PAVED_TILES.has(tile)) return 1;
    return 9;
  };
}

/**
 * Roads are rendered as a small set of continuous routes rather than every
 * adjacent road cell. The latter turns wide streets and plazas into a lattice.
 * Routes follow the paved network from the map entrance to every exit and
 * building door, which matches how the maps are authored.
 */
export function roadSegments(map: LocalMap): RoadSegment[] {
  const segments: RoadSegment[] = [];
  const seen = new Set<string>();
  const add = (from: Hex, to: Hex) => {
    const fromTile = localTileAt(map, from);
    const toTile = localTileAt(map, to);
    if (!ROAD_TILES.has(fromTile) && !ROAD_TILES.has(toTile)) return;
    const key = segmentKey(from, to);
    if (seen.has(key)) return;
    seen.add(key);
    segments.push({
      from,
      to,
      bridge: fromTile === "bridge" || toTile === "bridge",
    });
  };

  const targets = [...map.exits.map((exit) => exit.hex), ...map.buildings.map((entry) => entry.hex)];
  for (const target of targets) {
    const route = findPath(map.entrance, target, roadCost(map));
    if (!route) continue;
    let previous = map.entrance;
    for (const step of route.path) {
      add(previous, step);
      previous = step;
    }
  }
  if (segments.length > 0) return segments;

  // Battle arenas and handcrafted maps without exits/buildings can still have
  // a clean one-wide road; connect its corridor directly.
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const hex = { q: col - Math.floor(row / 2), r: row };
      if (!ROAD_TILES.has(localTileAt(map, hex))) continue;
      for (let direction = 0; direction < 3; direction += 1) {
        const other = neighbor(hex, direction);
        if (!ROAD_TILES.has(localTileAt(map, other))) continue;
        add(hex, other);
      }
    }
  }
  return segments;
}

export function waterSegments(map: LocalMap): Array<{ from: Hex; to: Hex }> {
  const result: Array<{ from: Hex; to: Hex }> = [];
  const seen = new Set<string>();
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const hex = { q: col - Math.floor(row / 2), r: row };
      if (localTileAt(map, hex) !== "water") continue;
      for (let direction = 0; direction < 3; direction += 1) {
        const other = neighbor(hex, direction);
        if (localTileAt(map, other) !== "water") continue;
        const key = segmentKey(hex, other);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ from: hex, to: other });
      }
    }
  }
  return result;
}
