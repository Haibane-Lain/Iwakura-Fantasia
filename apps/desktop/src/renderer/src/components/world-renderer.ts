import { getTerrain } from "@iwakura/content";
import type { Hex, PointOfInterest, WorldState } from "@iwakura/contracts";
import {
  axialIndex,
  axialToOffset,
  cornerOffset,
  hashString,
  hexToPixel,
  offsetToAxial,
  pathBetween,
  pixelToHex,
} from "@iwakura/engine";
import {
  type Application,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Point,
  Rectangle,
  Text,
} from "pixi.js";
import { addFlatHexTop, MeshBuilder, meshFrom } from "../render/iso/mesh";
import { tileTexture } from "../render/iso/textures";

const HEX_SIZE = 24;
const LABEL_ZOOM = 0.42;

function terrainTextureId(terrain: string): string {
  switch (terrain) {
    case "ocean":
    case "coast":
    case "lake":
      return "water";
    case "beach":
    case "desert":
      return "sand";
    case "forest":
      return "tree";
    case "hills":
      return "high_ground";
    case "mountains":
      return "rock";
    case "swamp":
      return "marsh";
    case "tundra":
      return "field";
    case "snow":
      return "snow";
    default:
      return "grass";
  }
}

export interface WorldRendererCallbacks {
  onTravel: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
}

interface PoiEntry {
  poi: PointOfInterest;
  container: Container;
  label: Text;
  index: number;
}

function hexPoints(center: { x: number; y: number }, size: number): number[] {
  const points: number[] = [];
  for (let corner = 0; corner < 6; corner += 1) {
    const point = cornerOffset(corner, size);
    points.push(center.x + point.x, center.y + point.y);
  }
  return points;
}

function drawHex(
  g: Graphics,
  center: { x: number; y: number },
  size: number,
  color: number,
  alpha = 1,
): void {
  const points = hexPoints(center, size);
  g.poly(points, true).fill({ color, alpha });
}

function drawHexOutline(
  g: Graphics,
  center: { x: number; y: number },
  size: number,
  color: number,
  width: number,
  alpha = 1,
): void {
  const points = hexPoints(center, size);
  g.poly(points, true).stroke({ color, width, alpha });
}

export class WorldRenderer {
  private world: WorldState;
  private partyHex: Hex;
  private readonly camera = new Container();
  private readonly poiLayer = new Container();
  private readonly fogLayer = new Graphics();
  private readonly pathLayer = new Graphics();
  private readonly highlightLayer = new Graphics();
  private readonly partyLayer = new Container();
  private readonly poiEntries: PoiEntry[] = [];
  private readonly callbackRef: WorldRendererCallbacks;

  private dragging = false;
  private dragDistance = 0;
  private lastPointer = { x: 0, y: 0 };
  private hoverHex: Hex | null = null;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private minScale = 0.2;
  private maxScale = 3;

  constructor(
    private readonly app: Application,
    world: WorldState,
    partyHex: Hex,
    callbacks: WorldRendererCallbacks,
  ) {
    this.world = world;
    this.partyHex = partyHex;
    this.callbackRef = callbacks;

    this.app.stage.addChild(this.camera);
    this.buildTerrain();
    this.camera.addChild(this.fogLayer, this.poiLayer, this.pathLayer, this.highlightLayer, this.partyLayer);
    this.buildPois();
    this.buildParty();
    this.updateFog();
    this.updatePois();
    this.updateParty();
    this.bindInput();

    this.fitToScreen();
    this.wheelHandler = (event) => this.onWheel(event);
    this.app.canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
  }

  private buildTerrain(): void {
    const groups = new Map<
      string,
      { terrain: string; tileId: string; variant: number; builder: MeshBuilder }
    >();
    const relief = new Graphics();

    for (let row = 0; row < this.world.height; row += 1) {
      for (let col = 0; col < this.world.width; col += 1) {
        const index = row * this.world.width + col;
        const axial = offsetToAxial({ col, row });
        const terrain = this.world.terrain[index] ?? "ocean";
        const tileId = terrainTextureId(terrain);
        const variant = hashString(`${this.world.seed}:${col}:${row}:${terrain}`) % 3;
        const key = `${terrain}:${variant}`;
        let group = groups.get(key);
        if (!group) {
          group = { terrain, tileId, variant, builder: new MeshBuilder() };
          groups.set(key, group);
        }
        addFlatHexTop(group.builder, axial, HEX_SIZE);

        const here = this.world.elevation[index] ?? 0.5;
        const north = this.world.elevation[index - this.world.width] ?? here;
        const west = this.world.elevation[index - 1] ?? here;
        const slope = (here - north) * 0.65 + (here - west) * 0.35;
        if (!getTerrain(terrain).water && Math.abs(slope) > 0.012) {
          const center = hexToPixel(axial, HEX_SIZE);
          const alpha = Math.min(0.18, Math.abs(slope) * 0.55);
          drawHex(relief, center, HEX_SIZE * 0.98, slope > 0 ? 0xfff1cf : 0x050505, alpha);
        }
      }
    }

    for (const group of groups.values()) {
      const color = getTerrain(group.terrain).color;
      const mesh = meshFrom(group.builder, tileTexture(group.tileId, color, group.variant));
      if (mesh) this.camera.addChild(mesh);
    }
    this.camera.addChild(relief);

    const rivers = new Graphics();
    const roads = new Graphics();

    // Rivers are drawn as connected strokes rather than filled hexes, so the
    // water reads as a channel even at low zoom.
    const riverDirections = [1, 0, 0, 1, 1, 1];
    for (let row = 0; row < this.world.height; row += 1) {
      for (let col = 0; col < this.world.width; col += 1) {
        const index = row * this.world.width + col;
        if (!this.world.river[index]) continue;
        const center = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE);
        rivers.circle(center.x, center.y, HEX_SIZE * 0.26).fill({ color: 0x3f7890, alpha: 0.9 });
        for (let d = 0; d < riverDirections.length; d += 2) {
          const other = { col: col + riverDirections[d]!, row: row + riverDirections[d + 1]! };
          if (
            other.col < 0 ||
            other.col >= this.world.width ||
            other.row < 0 ||
            other.row >= this.world.height
          ) {
            continue;
          }
          if (!this.world.river[other.row * this.world.width + other.col]) continue;
          const otherCenter = hexToPixel(offsetToAxial(other), HEX_SIZE);
          rivers
            .moveTo(center.x, center.y)
            .lineTo(otherCenter.x, otherCenter.y)
            .stroke({ color: 0x1c3947, width: 7, alpha: 0.8 })
            .moveTo(center.x, center.y)
            .lineTo(otherCenter.x, otherCenter.y)
            .stroke({ color: 0x4a8fa8, width: 4, alpha: 0.95 });
        }
      }
    }

    // Road lines connect adjacent road cells, so junctions read as roads.
    const directions = [1, 0, 0, 1, 1, 1];
    for (let row = 0; row < this.world.height; row += 1) {
      for (let col = 0; col < this.world.width; col += 1) {
        const index = row * this.world.width + col;
        if (!this.world.road[index]) continue;
        const center = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE);
        for (let d = 0; d < directions.length; d += 2) {
          const other = { col: col + directions[d]!, row: row + directions[d + 1]! };
          if (
            other.col < 0 ||
            other.col >= this.world.width ||
            other.row < 0 ||
            other.row >= this.world.height
          ) {
            continue;
          }
          if (!this.world.road[other.row * this.world.width + other.col]) continue;
          const otherCenter = hexToPixel(offsetToAxial(other), HEX_SIZE);
          roads
            .moveTo(center.x, center.y)
            .lineTo(otherCenter.x, otherCenter.y)
            .stroke({ color: 0x2a2116, width: 5, alpha: 0.55 })
            .moveTo(center.x, center.y)
            .lineTo(otherCenter.x, otherCenter.y)
            .stroke({ color: 0xc5a66b, width: 2.4, alpha: 0.9 });
        }
      }
    }

    this.camera.addChild(roads, rivers);

    // Cartographic symbols keep the top-down atlas readable: mountain peaks,
    // forest clusters, and hill contours are drawn as glyphs rather than
    // pretending the atlas is a second perspective view.
    const decor = new Graphics();
    for (let row = 0; row < this.world.height; row += 1) {
      for (let col = 0; col < this.world.width; col += 1) {
        const index = row * this.world.width + col;
        const terrain = this.world.terrain[index] ?? "ocean";
        if (terrain === "ocean" || terrain === "coast" || terrain === "lake") continue;
        const center = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE);
        const seed = hashString(`${this.world.seed}:decor:${col}:${row}`);
        if (terrain === "mountains") {
          const x = center.x;
          const y = center.y;
          decor
            .poly([x - 9, y + 6, x - 1, y - 9, x + 5, y + 6], true)
            .fill({ color: 0x686762, alpha: 0.86 })
            .stroke({ color: 0x2b2d29, width: 0.7, alpha: 0.7 });
          decor
            .poly([x - 4, y - 3, x - 1, y - 9, x + 2, y - 2, x, y - 4], true)
            .fill({ color: 0xd8dbd3, alpha: 0.82 });
          decor
            .poly([x + 2, y + 7, x + 9, y - 5, x + 13, y + 7], true)
            .fill({ color: 0x555650, alpha: 0.8 })
            .stroke({ color: 0x2b2d29, width: 0.7, alpha: 0.65 });
        } else if (terrain === "forest" && seed % 2 === 0) {
          const x = center.x + ((seed % 7) - 3) * 1.1;
          const y = center.y + ((Math.floor(seed / 7) % 5) - 2);
          for (const [dx, dy, radius] of [
            [-4, 1, 3.4],
            [0, -2, 4.1],
            [4, 1, 3.2],
          ] as const) {
            decor
              .circle(x + dx, y + dy, radius)
              .fill({ color: 0x2d462b, alpha: 0.82 })
              .stroke({ color: 0x162317, width: 0.5, alpha: 0.55 });
          }
        } else if (terrain === "hills" && seed % 2 === 0) {
          decor
            .poly([center.x - 7, center.y + 4, center.x - 1, center.y - 4, center.x + 6, center.y + 4], true)
            .fill({ color: 0x5e5a4b, alpha: 0.42 })
            .stroke({ color: 0x2f2e27, width: 0.6, alpha: 0.55 });
          decor
            .moveTo(center.x - 10, center.y + 5)
            .quadraticCurveTo(center.x - 4, center.y - 3, center.x + 5, center.y + 3)
            .stroke({ color: 0x3a3529, width: 0.8, alpha: 0.28 });
        }
      }
    }
    this.camera.addChild(decor);
  }

  private buildPois(): void {
    for (const poi of this.world.pois) {
      const index = axialIndex(this.world.width, this.world.height, poi.hex);
      if (index < 0) continue;
      const marker = new Graphics();
      const color =
        poi.kind === "town"
          ? 0xe8c987
          : poi.kind === "village"
            ? 0xc9a35a
            : poi.kind === "dungeon"
              ? 0xa45a3a
              : poi.kind === "shrine"
                ? 0x8fb5b6
                : poi.kind === "ruin"
                  ? 0x948872
                  : 0xd8c89a;

      if (poi.kind === "dungeon") {
        marker
          .poly([0, -8, 8, 6, -8, 6], true)
          .fill({ color })
          .stroke({ color: 0x080706, width: 1.5 }) as Graphics;
      } else if (poi.kind === "shrine") {
        marker
          .poly([0, -7, 7, 0, 0, 7, -7, 0], true)
          .fill({ color })
          .stroke({ color: 0x080706, width: 1.5 }) as Graphics;
      } else if (poi.kind === "ruin") {
        marker.rect(-5, -5, 10, 10).fill({ color }).stroke({ color: 0x080706, width: 1.5 });
      } else {
        const radius = poi.kind === "town" ? 7 : poi.kind === "village" ? 5.5 : 4.5;
        marker.circle(0, 0, radius).fill({ color }).stroke({ color: 0x080706, width: 1.5 });
        if (poi.kind === "town") {
          marker.circle(0, 0, radius + 3).stroke({ color, width: 1, alpha: 0.45 });
        }
      }

      const label = new Text({
        text: poi.name,
        style: {
          fontFamily: "Palatino Linotype, Georgia, serif",
          fontSize: 10,
          fill: 0xe9dfc8,
          stroke: { color: 0x080706, width: 3 },
          align: "center",
        },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 9);

      const container = new Container();
      container.addChild(marker, label);
      container.position.set(hexToPixel(poi.hex, HEX_SIZE).x, hexToPixel(poi.hex, HEX_SIZE).y);
      this.poiLayer.addChild(container);
      this.poiEntries.push({ poi, container, label, index });
    }
  }

  private buildParty(): void {
    const ring = new Graphics();
    ring
      .circle(0, 0, 12)
      .fill({ color: 0xe8c987, alpha: 0.12 })
      .stroke({ color: 0xf5e6c8, width: 1, alpha: 0.85 });
    ring.circle(0, 0, 7).fill({ color: 0xe8c987 }).stroke({ color: 0x080706, width: 1.4 });
    ring.circle(0, 0, 2.6).fill({ color: 0x080706 });
    const label = new Text({
      text: "Party",
      style: {
        fontFamily: "Palatino Linotype, Georgia, serif",
        fontSize: 9,
        fill: 0xf5e6c8,
        stroke: { color: 0x080706, width: 3 },
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 13);
    this.partyLayer.addChild(ring, label);
  }

  private bindInput(): void {
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.app.canvas.style.cursor = "grab";

    this.app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
      this.dragging = true;
      this.dragDistance = 0;
      this.lastPointer = { x: event.global.x, y: event.global.y };
      this.app.canvas.style.cursor = "grabbing";
    });

    this.app.stage.on("pointermove", (event: FederatedPointerEvent) => {
      if (this.dragging) {
        const dx = event.global.x - this.lastPointer.x;
        const dy = event.global.y - this.lastPointer.y;
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        this.camera.position.set(this.camera.position.x + dx, this.camera.position.y + dy);
        this.lastPointer = { x: event.global.x, y: event.global.y };
      }
      this.updateHover(event.global.x, event.global.y);
    });

    const finish = (event: FederatedPointerEvent) => {
      if (this.dragging && this.dragDistance < 6) {
        const hex = this.hexAt(event.global.x, event.global.y);
        if (hex) this.callbackRef.onTravel(hex);
      }
      this.dragging = false;
      this.app.canvas.style.cursor = "grab";
    };
    this.app.stage.on("pointerup", finish);
    this.app.stage.on("pointerupoutside", finish);

    this.app.stage.on("pointerleave", () => {
      this.dragging = false;
      this.app.canvas.style.cursor = "grab";
      this.hoverHex = null;
      this.callbackRef.onHover(null);
      this.pathLayer.clear();
      this.highlightLayer.clear();
    });
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const before = this.camera.toLocal(new Point(x, y));
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    const next = Math.max(this.minScale * 0.55, Math.min(this.maxScale, this.camera.scale.x * factor));
    this.camera.scale.set(next);
    this.camera.position.set(x - before.x * next, y - before.y * next);
    this.updateLabels();
    this.updateHover(x, y);
  }

  private fitToScreen(): void {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let row = 0; row < this.world.height; row += 1) {
      for (let col = 0; col < this.world.width; col += 1) {
        const point = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE);
        minX = Math.min(minX, point.x - HEX_SIZE);
        maxX = Math.max(maxX, point.x + HEX_SIZE);
        minY = Math.min(minY, point.y - HEX_SIZE);
        maxY = Math.max(maxY, point.y + HEX_SIZE);
      }
    }
    const padding = 48;
    const fitScale = Math.min(
      (this.app.screen.width - padding * 2) / Math.max(1, maxX - minX),
      (this.app.screen.height - padding * 2) / Math.max(1, maxY - minY),
    );
    const initialScale = Math.max(fitScale, 0.62);
    this.minScale = fitScale;
    this.maxScale = Math.max(2.5, fitScale * 6);
    const center = hexToPixel(this.partyHex, HEX_SIZE);
    this.camera.scale.set(initialScale);
    this.camera.position.set(
      this.app.screen.width / 2 - center.x * initialScale,
      this.app.screen.height / 2 - center.y * initialScale,
    );
    this.updateLabels();
  }

  private hexAt(screenX: number, screenY: number): Hex | null {
    const local = this.camera.toLocal(new Point(screenX, screenY));
    const hex = pixelToHex(local, HEX_SIZE);
    const offset = axialToOffset(hex);
    if (
      offset.col < 0 ||
      offset.col >= this.world.width ||
      offset.row < 0 ||
      offset.row >= this.world.height
    ) {
      return null;
    }
    return hex;
  }

  private updateHover(screenX: number, screenY: number): void {
    const hex = this.hexAt(screenX, screenY);
    if (hex?.q === this.hoverHex?.q && hex?.r === this.hoverHex?.r) {
      return;
    }
    this.hoverHex = hex;
    this.callbackRef.onHover(hex);
    this.drawHover(hex);
  }

  private drawHover(hex: Hex | null): void {
    this.pathLayer.clear();
    this.highlightLayer.clear();
    if (!hex) return;

    const center = hexToPixel(hex, HEX_SIZE);
    const route = pathBetween(this.world, this.partyHex, hex);
    if (!route) {
      drawHexOutline(this.highlightLayer, center, HEX_SIZE * 0.94, 0x8e3d36, 2);
      return;
    }

    drawHex(this.highlightLayer, center, HEX_SIZE * 0.94, 0xe8c987, 0.12);
    drawHexOutline(this.highlightLayer, center, HEX_SIZE * 0.94, 0xe8c987, 2);
    let previous = hexToPixel(this.partyHex, HEX_SIZE);
    for (const step of route.path) {
      const next = hexToPixel(step, HEX_SIZE);
      this.pathLayer
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({ color: 0x080706, width: 6, alpha: 0.5 })
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({ color: 0xe8c987, width: 2.6, alpha: 0.95 });
      previous = next;
    }
  }

  private updateFog(): void {
    this.fogLayer.clear();
    for (let row = 0; row < this.world.height; row += 1) {
      for (let col = 0; col < this.world.width; col += 1) {
        const index = row * this.world.width + col;
        const fog = this.world.fog[index] ?? 0;
        if (fog === 2) continue;
        const center = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE + 0.5);
        drawHex(this.fogLayer, center, HEX_SIZE + 0.5, 0x070605, fog === 0 ? 1 : 0.52);
      }
    }
  }

  private updatePois(): void {
    for (const entry of this.poiEntries) {
      const fog = this.world.fog[entry.index] ?? 0;
      const visible = entry.poi.discovered && fog > 0;
      entry.container.visible = visible;
      entry.container.alpha = fog === 2 ? 1 : visible ? 0.55 : 0;
    }
    this.updateLabels();
  }

  private updateLabels(): void {
    for (const entry of this.poiEntries) {
      entry.label.visible = entry.container.visible && this.camera.scale.x > LABEL_ZOOM;
    }
  }

  private updateParty(): void {
    const center = hexToPixel(this.partyHex, HEX_SIZE);
    this.partyLayer.position.set(center.x, center.y);
  }

  update(world: WorldState, partyHex: Hex): void {
    this.world = world;
    this.partyHex = partyHex;
    this.updateFog();
    this.updatePois();
    this.updateParty();
    this.drawHover(this.hoverHex);
  }

  handleResize(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
  }

  destroy(): void {
    this.app.canvas.removeEventListener("wheel", this.wheelHandler);
    this.app.destroy({ removeView: true }, { children: true });
  }
}
