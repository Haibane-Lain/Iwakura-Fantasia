import { getLocalTile } from "@iwakura/content";
import type { Hex, LocalBuilding, LocalMap, LocalPoint } from "@iwakura/contracts";
import { axialToOffset, distance, hexKey, hexToPixel, neighbors, offsetToAxial } from "@iwakura/engine";
import { Container, Graphics, type Texture } from "pixi.js";
import { addBuilding, type BuildingBox, meshFrom } from "./mesh";
import { projectPoint } from "./projection";
import { roofTexture, wallTexture } from "./textures";

export interface BuildingVisual {
  building?: LocalBuilding;
  box: BuildingBox;
  center: Hex;
  label: { x: number; y: number };
  doorFace: "south" | "east";
  style: "plaster" | "stone" | "timber";
  roofColor: number;
  wallColor: number;
}

interface RoofComponent {
  hexes: Hex[];
  points: LocalPoint[];
}

function componentsFromTiles(map: LocalMap): RoofComponent[] {
  const roof = new Set<string>();
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const index = row * map.width + col;
      if (map.tiles[index] === "roof") roof.add(hexKey(offsetToAxial({ col, row })));
    }
  }

  const components: RoofComponent[] = [];
  const visited = new Set<string>();
  for (const startKey of roof) {
    if (visited.has(startKey)) continue;
    const [q, r] = startKey.split(",").map(Number);
    const start: Hex = { q: q ?? 0, r: r ?? 0 };
    const queue: Hex[] = [start];
    const hexes: Hex[] = [];
    visited.add(startKey);
    while (queue.length > 0) {
      const current = queue.pop()!;
      hexes.push(current);
      for (const next of neighbors(current)) {
        const key = hexKey(next);
        if (!roof.has(key) || visited.has(key)) continue;
        visited.add(key);
        queue.push(next);
      }
    }
    components.push({
      hexes,
      points: hexes.map((hex) => axialToOffset(hex)),
    });
  }
  return components;
}

function componentBox(hexes: Hex[], size: number): BuildingBox {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const hex of hexes) {
    const center = hexToPixel(hex, size);
    minX = Math.min(minX, center.x);
    maxX = Math.max(maxX, center.x);
    minY = Math.min(minY, center.y);
    maxY = Math.max(maxY, center.y);
  }
  const width = Math.max(size * 1.7, maxX - minX + size * 1.9);
  const depth = Math.max(size * 1.55, maxY - minY + size * 1.65);
  return {
    minX: (minX + maxX) / 2 - width / 2,
    maxX: (minX + maxX) / 2 + width / 2,
    minY: (minY + maxY) / 2 - depth / 2,
    maxY: (minY + maxY) / 2 + depth / 2,
    baseZ: 0.04,
    wallHeight: 0,
    roofHeight: 0,
    ridgeAlongX: width >= depth,
  };
}

function styleFor(building: LocalBuilding | undefined): {
  style: "plaster" | "stone" | "timber";
  wallColor: number;
  roofColor: number;
  wallHeight: number;
  roofHeight: number;
} {
  switch (building?.kind) {
    case "temple":
      return {
        style: "stone",
        wallColor: 0x827968,
        roofColor: 0x4b5360,
        wallHeight: 49,
        roofHeight: 19,
      };
    case "hall":
      return {
        style: "stone",
        wallColor: 0x746a58,
        roofColor: 0x59452f,
        wallHeight: 54,
        roofHeight: 20,
      };
    case "inn":
      return {
        style: "plaster",
        wallColor: 0xb69d75,
        roofColor: 0x6f4331,
        wallHeight: 42,
        roofHeight: 17,
      };
    case "shop":
      return {
        style: "timber",
        wallColor: 0x8c6a45,
        roofColor: 0x75482f,
        wallHeight: 37,
        roofHeight: 15,
      };
    case "workshop":
      return {
        style: "timber",
        wallColor: 0x7e6041,
        roofColor: 0x60452d,
        wallHeight: 39,
        roofHeight: 15,
      };
    case "gate":
      return {
        style: "stone",
        wallColor: 0x777064,
        roofColor: 0x4a3a2d,
        wallHeight: 44,
        roofHeight: 12,
      };
    case "other":
      return {
        style: "stone",
        wallColor: 0x655e52,
        roofColor: 0x4b4032,
        wallHeight: 34,
        roofHeight: 12,
      };
    default:
      return {
        style: "plaster",
        wallColor: 0xa88f6b,
        roofColor: 0x62452f,
        wallHeight: 33,
        roofHeight: 14,
      };
  }
}

function nearestBuilding(
  buildings: LocalBuilding[],
  hexes: Hex[],
): { building: LocalBuilding; score: number } | undefined {
  let best: { building: LocalBuilding; score: number } | undefined;
  for (const building of buildings) {
    const score = Math.min(...hexes.map((hex) => distance(hex, building.hex)));
    if (!best || score < best.score) best = { building, score };
  }
  return best;
}

export function buildingVisuals(map: LocalMap, size: number): BuildingVisual[] {
  const components = componentsFromTiles(map);
  const visuals: BuildingVisual[] = [];
  const claimed = new Set<string>();

  for (const component of components) {
    const match = nearestBuilding(map.buildings, component.hexes);
    const building =
      match && match.score <= 4 && !claimed.has(match.building.id) ? match.building : undefined;
    if (building) claimed.add(building.id);
    const style = styleFor(building);
    const box = {
      ...componentBox(component.hexes, size),
      wallHeight: style.wallHeight,
      roofHeight: style.roofHeight,
    };
    const center = {
      q: Math.round(component.hexes.reduce((sum, hex) => sum + hex.q, 0) / component.hexes.length),
      r: Math.round(component.hexes.reduce((sum, hex) => sum + hex.r, 0) / component.hexes.length),
    };
    const centerWorld = hexToPixel(center, size);
    const labelPoint = projectPoint(
      { x: centerWorld.x, y: centerWorld.y },
      box.baseZ + box.wallHeight + box.roofHeight + 8,
    );
    visuals.push({
      building,
      box,
      center,
      label: { x: labelPoint.x, y: labelPoint.y },
      doorFace: building && hexToPixel(building.hex, size).y > centerWorld.y ? "south" : "east",
      style: style.style,
      roofColor: style.roofColor,
      wallColor: style.wallColor,
    });
  }

  for (const building of map.buildings) {
    if (claimed.has(building.id)) continue;
    const style = styleFor(building);
    const center = hexToPixel(building.hex, size);
    const width = size * 2.05;
    const depth = size * 1.75;
    const box: BuildingBox = {
      minX: center.x - width / 2,
      maxX: center.x + width / 2,
      minY: center.y - depth / 2,
      maxY: center.y + depth / 2,
      baseZ: 0.04,
      wallHeight: style.wallHeight,
      roofHeight: style.roofHeight,
      ridgeAlongX: width >= depth,
    };
    const labelPoint = projectPoint(
      { x: center.x, y: center.y },
      box.baseZ + box.wallHeight + box.roofHeight + 8,
    );
    visuals.push({
      building,
      box,
      center: building.hex,
      label: { x: labelPoint.x, y: labelPoint.y },
      doorFace: "south",
      style: style.style,
      roofColor: style.roofColor,
      wallColor: style.wallColor,
    });
  }

  return visuals;
}

function addFacadeDetails(container: Container, visual: BuildingVisual, size: number, hour: number): void {
  const box = visual.box;
  const wallTop = box.baseZ + box.wallHeight;
  const doorX = visual.building ? hexToPixel(visual.building.hex, size).x : (box.minX + box.maxX) / 2;
  const doorY = visual.building ? hexToPixel(visual.building.hex, size).y : (box.minY + box.maxY) / 2;
  const night = hour < 7 || hour >= 19;
  const details = new Graphics();

  const addPanel = (
    face: "south" | "east",
    offset: number,
    width: number,
    bottom: number,
    height: number,
    color: number,
    alpha = 1,
  ) => {
    const inset = 0.4;
    if (face === "south") {
      const y = box.maxY + inset;
      const a = projectPoint({ x: offset, y }, box.baseZ + bottom);
      const b = projectPoint({ x: offset + width, y }, box.baseZ + bottom);
      const c = projectPoint({ x: offset + width, y }, box.baseZ + bottom + height);
      const d = projectPoint({ x: offset, y }, box.baseZ + bottom + height);
      details.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y], true).fill({ color, alpha });
    } else {
      const x = box.maxX + inset;
      const a = projectPoint({ x, y: offset }, box.baseZ + bottom);
      const b = projectPoint({ x, y: offset + width }, box.baseZ + bottom);
      const c = projectPoint({ x, y: offset + width }, box.baseZ + bottom + height);
      const d = projectPoint({ x, y: offset }, box.baseZ + bottom + height);
      details.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y], true).fill({ color, alpha });
    }
  };

  if (visual.doorFace === "south") {
    addPanel("south", doorX - 5, 10, 0.5, 18, 0x241b13, 0.95);
    addPanel(
      "south",
      box.minX + (box.maxX - box.minX) * 0.18,
      7,
      17,
      8,
      night ? 0xe2b36d : 0x4b4032,
      night ? 0.85 : 0.8,
    );
    addPanel(
      "south",
      box.minX + (box.maxX - box.minX) * 0.72,
      7,
      17,
      8,
      night ? 0xe2b36d : 0x4b4032,
      night ? 0.85 : 0.8,
    );
  } else {
    addPanel("east", doorY - 5, 10, 0.5, 18, 0x241b13, 0.95);
    addPanel(
      "east",
      box.minY + (box.maxY - box.minY) * 0.2,
      7,
      17,
      8,
      night ? 0xe2b36d : 0x4b4032,
      night ? 0.85 : 0.8,
    );
    addPanel(
      "east",
      box.minY + (box.maxY - box.minY) * 0.72,
      7,
      17,
      8,
      night ? 0xe2b36d : 0x4b4032,
      night ? 0.85 : 0.8,
    );
  }

  if (visual.building?.kind === "shop") {
    const a = projectPoint({ x: doorX - 8, y: box.maxY + 1 }, wallTop - 3);
    const b = projectPoint({ x: doorX + 8, y: box.maxY + 1 }, wallTop - 3);
    details.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xc9a35a, width: 2, alpha: 0.85 });
  }

  container.addChild(details);
}

export function addBuildingVisuals(
  layer: Container,
  map: LocalMap,
  size: number,
  hour: number,
): BuildingVisual[] {
  const visuals = buildingVisuals(map, size);
  for (const visual of visuals) {
    const container = new Container();
    const walls = addBuilding(visual.box);
    const wallTex: Texture = wallTexture(visual.style, visual.wallColor);
    const roofTex: Texture = roofTexture(visual.roofColor);
    const wallMesh = meshFrom(walls.walls, wallTex);
    const roofMesh = meshFrom(walls.roof, roofTex);
    if (wallMesh) container.addChild(wallMesh);
    if (roofMesh) container.addChild(roofMesh);
    addFacadeDetails(container, visual, size, hour);
    const base = projectPoint(
      { x: (visual.box.minX + visual.box.maxX) / 2, y: visual.box.maxY },
      visual.box.baseZ,
    );
    container.zIndex = base.y + 2;
    layer.addChild(container);
  }
  return visuals;
}

export function addGatehouse(
  layer: Container,
  point: Hex,
  size: number,
  kind: "town" | "village" | "dungeon" | "other",
): Container {
  const center = hexToPixel(point, size);
  const container = new Container();
  if (kind === "dungeon" || kind === "other") {
    const mouth = new Graphics();
    const base = projectPoint({ x: center.x, y: center.y }, 0.12);
    mouth
      .ellipse(base.x, base.y - 4, 15, 11)
      .fill({ color: 0x15120e, alpha: 0.95 })
      .stroke({ color: 0x4a4237, width: 2.5 });
    mouth.ellipse(base.x, base.y - 6, 10, 8).fill({ color: 0x060504, alpha: 0.9 });
    container.addChild(mouth);
    const stones = new Graphics();
    for (const [dx, dy, width] of [
      [-15, -10, 8],
      [8, -11, 9],
      [-18, 0, 7],
      [11, -1, 6],
    ] as const) {
      const p = projectPoint({ x: center.x + dx, y: center.y + dy }, 0.1);
      stones
        .poly(
          [
            p.x - width / 2,
            p.y + 4,
            p.x + width / 2,
            p.y + 2,
            p.x + width / 2 + 2,
            p.y - 4,
            p.x - width / 2 - 1,
            p.y - 2,
          ],
          true,
        )
        .fill({ color: 0x625b4e, alpha: 0.9 })
        .stroke({ color: 0x2a251e, width: 1 });
    }
    container.addChild(stones);
    container.zIndex = projectPoint(center, 0).y + 1;
  } else {
    const width = size * 1.65;
    const depth = size * 0.72;
    const box: BuildingBox = {
      minX: center.x - width / 2,
      maxX: center.x + width / 2,
      minY: center.y - depth / 2,
      maxY: center.y + depth / 2,
      baseZ: 0.05,
      wallHeight: 30,
      roofHeight: 11,
      ridgeAlongX: true,
    };
    const walls = addBuilding(box);
    const wallMesh = meshFrom(walls.walls, wallTexture("stone", 0x7a7263));
    const roofMesh = meshFrom(walls.roof, roofTexture(0x54412f));
    if (wallMesh) container.addChild(wallMesh);
    if (roofMesh) container.addChild(roofMesh);
    const gate = new Graphics();
    const a = projectPoint({ x: center.x - 7, y: box.maxY + 0.6 }, 0.5);
    const b = projectPoint({ x: center.x + 7, y: box.maxY + 0.6 }, 0.5);
    const c = projectPoint({ x: center.x + 7, y: box.maxY + 0.6 }, 18);
    const d = projectPoint({ x: center.x - 7, y: box.maxY + 0.6 }, 18);
    gate
      .poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y], true)
      .fill({ color: 0x17120d, alpha: 0.95 })
      .stroke({ color: 0x3c3124, width: 1.5 });
    container.addChild(gate);
    container.zIndex = projectPoint(center, 0).y + 2;
  }
  layer.addChild(container);
  return container;
}

export function buildingTileColor(tileId: string): number {
  return getLocalTile(tileId).color;
}
