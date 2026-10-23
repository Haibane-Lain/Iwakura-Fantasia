import { getLocalTile, getPalette } from "@iwakura/content";
import type { Hex, LocalMap } from "@iwakura/contracts";
import {
  axialToOffset,
  cornerOffset,
  findPath,
  hexToPixel,
  localTileAt,
  offsetToAxial,
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

const HEX_SIZE = 34;
const LABEL_ZOOM = 0.34;

export interface LocalNpcMarker {
  id: string;
  name: string;
  hex: Hex;
  palette: string;
  activity: string;
}

export interface LocalRendererCallbacks {
  onSelect: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
}

function hexPoints(center: { x: number; y: number }, size: number): number[] {
  const points: number[] = [];
  for (let corner = 0; corner < 6; corner += 1) {
    const offset = cornerOffset(corner, size);
    points.push(center.x + offset.x, center.y + offset.y);
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
  g.poly(hexPoints(center, size), true).fill({ color, alpha });
}

function hexLabel(text: string, color = 0xe9dfc8, size = 9): Text {
  return new Text({
    text,
    style: {
      fontFamily: "Palatino Linotype, Georgia, serif",
      fontSize: size,
      fill: color,
      stroke: { color: 0x080706, width: 3 },
      align: "center",
    },
  });
}

export class LocalRenderer {
  private map: LocalMap;
  private partyHex: Hex;
  private readonly camera = new Container();
  private readonly staticLayer = new Container();
  private readonly dynamicLayer = new Container();
  private readonly highlightLayer = new Graphics();
  private readonly pathLayer = new Graphics();
  private readonly labels: Array<{ text: Text; hex: Hex }> = [];
  private readonly callbacks: LocalRendererCallbacks;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private hoverHex: Hex | null = null;
  private dragging = false;
  private dragDistance = 0;
  private lastPointer = { x: 0, y: 0 };
  private minScale = 0.25;
  private maxScale = 3;

  constructor(
    private readonly app: Application,
    map: LocalMap,
    partyHex: Hex,
    npcs: LocalNpcMarker[],
    callbacks: LocalRendererCallbacks,
  ) {
    this.map = map;
    this.partyHex = partyHex;
    this.callbacks = callbacks;
    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.staticLayer, this.highlightLayer, this.pathLayer, this.dynamicLayer);
    this.buildStatic();
    this.update(map, partyHex, npcs);
    this.bindInput();
    this.fitToScreen();
    this.wheelHandler = (event) => this.onWheel(event);
    this.app.canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
  }

  private buildStatic(): void {
    const groups = new Map<string, Graphics>();
    for (const row of this.map.tiles) {
      if (!groups.has(row)) groups.set(row, new Graphics());
    }
    for (const [, graphics] of groups) this.staticLayer.addChild(graphics);
    const outline = new Graphics();
    this.staticLayer.addChild(outline);

    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const index = row * this.map.width + col;
        const tileId = this.map.tiles[index] ?? "grass";
        const center = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE);
        const graphics = groups.get(tileId);
        if (graphics) drawHex(graphics, center, HEX_SIZE, getLocalTile(tileId).color);
        outline.poly(hexPoints(center, HEX_SIZE), true).stroke({ color: 0x080706, width: 1, alpha: 0.22 });
      }
    }

    for (const building of this.map.buildings) {
      const center = hexToPixel(building.hex, HEX_SIZE);
      const marker = new Graphics();
      marker.circle(center.x, center.y, 5).fill({ color: 0xe8c987, alpha: 0.9 });
      marker.circle(center.x, center.y, 8).stroke({ color: 0xf5e6c8, width: 1, alpha: 0.45 });
      this.staticLayer.addChild(marker);
      const label = hexLabel(building.name, 0xf0e7d2, 9);
      label.anchor.set(0.5, 1);
      label.position.set(center.x, center.y - 10);
      this.staticLayer.addChild(label);
      this.labels.push({ text: label, hex: building.hex });
    }

    for (const exit of this.map.exits) {
      const center = hexToPixel(exit.hex, HEX_SIZE);
      const marker = new Graphics();
      marker
        .poly(
          [center.x, center.y - 8, center.x + 8, center.y, center.x, center.y + 8, center.x - 8, center.y],
          true,
        )
        .fill({ color: 0x8fb5b6, alpha: 0.8 })
        .stroke({ color: 0x080706, width: 1.5 });
      this.staticLayer.addChild(marker);
      const label = hexLabel(exit.name, 0xb9d0cd, 8);
      label.anchor.set(0.5, 0);
      label.position.set(center.x, center.y + 11);
      this.staticLayer.addChild(label);
      this.labels.push({ text: label, hex: exit.hex });
    }

    for (const interactable of this.map.interactables) {
      const center = hexToPixel(interactable.hex, HEX_SIZE);
      const marker = new Graphics();
      marker
        .rect(center.x - 6, center.y - 6, 12, 12)
        .fill({ color: 0xc9a35a, alpha: 0.9 })
        .stroke({ color: 0x080706, width: 1.5 });
      this.staticLayer.addChild(marker);
      const label = hexLabel(interactable.name, 0xe8dcc0, 8);
      label.anchor.set(0.5, 0);
      label.position.set(center.x, center.y + 11);
      this.staticLayer.addChild(label);
      this.labels.push({ text: label, hex: interactable.hex });
    }
  }

  private updateLabels(): void {
    for (const entry of this.labels) {
      entry.text.visible = this.camera.scale.x > LABEL_ZOOM;
    }
  }

  private drawNpc(npc: LocalNpcMarker): void {
    const center = hexToPixel(npc.hex, HEX_SIZE);
    const palette = getPalette(npc.palette);
    const token = new Graphics();
    token
      .circle(center.x, center.y, 11)
      .fill({ color: palette.cloak })
      .stroke({ color: palette.ink, width: 2 });
    token.circle(center.x, center.y, 13).stroke({ color: palette.trim, width: 1.4, alpha: 0.9 });
    this.dynamicLayer.addChild(token);
    const initials = npc.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("");
    const text = new Text({
      text: initials,
      style: {
        fontFamily: "Palatino Linotype, Georgia, serif",
        fontSize: 9,
        fill: 0xf0e7d2,
        fontWeight: "600",
      },
    });
    text.anchor.set(0.5);
    text.position.set(center.x, center.y);
    this.dynamicLayer.addChild(text);
    const label = hexLabel(npc.name, 0xe9dfc8, 8);
    label.anchor.set(0.5, 0);
    label.position.set(center.x, center.y + 12);
    this.dynamicLayer.addChild(label);
  }

  private drawParty(): void {
    const center = hexToPixel(this.partyHex, HEX_SIZE);
    const token = new Graphics();
    token
      .circle(center.x, center.y, 14)
      .fill({ color: 0xe8c987, alpha: 0.15 })
      .stroke({ color: 0xf5e6c8, width: 1.4 });
    token.circle(center.x, center.y, 8).fill({ color: 0xe8c987 }).stroke({ color: 0x080706, width: 2 });
    token.circle(center.x, center.y, 3).fill({ color: 0x080706 });
    this.dynamicLayer.addChild(token);
    const label = hexLabel("You", 0xf5e6c8, 8);
    label.anchor.set(0.5, 0);
    label.position.set(center.x, center.y + 16);
    this.dynamicLayer.addChild(label);
  }

  private drawHover(): void {
    this.highlightLayer.clear();
    this.pathLayer.clear();
    const hex = this.hoverHex;
    if (!hex) return;
    const center = hexToPixel(hex, HEX_SIZE);
    const walkable = getLocalTile(localTileAt(this.map, hex)).walkable;
    const route = findPath(this.partyHex, hex, (h) => (this.isWalkable(h) ? 1 : null));
    if (!route) {
      this.highlightLayer
        .poly(hexPoints(center, HEX_SIZE * 0.94), true)
        .stroke({ color: 0x8e3d36, width: 2 });
      return;
    }
    if (walkable) {
      this.highlightLayer
        .poly(hexPoints(center, HEX_SIZE * 0.94), true)
        .fill({ color: 0xe8c987, alpha: 0.1 })
        .stroke({ color: 0xe8c987, width: 2 });
    }
    let previous = hexToPixel(this.partyHex, HEX_SIZE);
    for (const step of route.path) {
      const next = hexToPixel(step, HEX_SIZE);
      this.pathLayer
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({ color: 0x080706, width: 6, alpha: 0.45 })
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({ color: 0xe8c987, width: 2.2, alpha: 0.9 });
      previous = next;
    }
  }

  private isWalkable(hex: Hex): boolean {
    const tile = getLocalTile(localTileAt(this.map, hex));
    return tile.walkable;
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
        if (hex) this.callbacks.onSelect(hex);
      }
      this.dragging = false;
      this.app.canvas.style.cursor = "grab";
    };
    this.app.stage.on("pointerup", finish);
    this.app.stage.on("pointerupoutside", finish);
    this.app.stage.on("pointerleave", () => {
      this.dragging = false;
      this.hoverHex = null;
      this.callbacks.onHover(null);
      this.highlightLayer.clear();
      this.pathLayer.clear();
      this.app.canvas.style.cursor = "grab";
    });
  }

  private updateHover(screenX: number, screenY: number): void {
    const hex = this.hexAt(screenX, screenY);
    if (hex?.q === this.hoverHex?.q && hex?.r === this.hoverHex?.r) return;
    this.hoverHex = hex;
    this.callbacks.onHover(hex);
    this.drawHover();
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
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const point = hexToPixel(offsetToAxial({ col, row }), HEX_SIZE);
        minX = Math.min(minX, point.x - HEX_SIZE);
        maxX = Math.max(maxX, point.x + HEX_SIZE);
        minY = Math.min(minY, point.y - HEX_SIZE);
        maxY = Math.max(maxY, point.y + HEX_SIZE);
      }
    }
    const padding = 40;
    const fitScale = Math.min(
      (this.app.screen.width - padding * 2) / Math.max(1, maxX - minX),
      (this.app.screen.height - padding * 2) / Math.max(1, maxY - minY),
    );
    const initialScale = Math.max(0.7, Math.min(fitScale, 1.8));
    this.minScale = Math.max(0.35, fitScale * 0.8);
    this.maxScale = Math.max(2.4, initialScale * 3);
    const center = hexToPixel(
      offsetToAxial({ col: Math.floor(this.map.width / 2), row: Math.floor(this.map.height / 2) }),
      HEX_SIZE,
    );
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
    if (offset.col < 0 || offset.col >= this.map.width || offset.row < 0 || offset.row >= this.map.height) {
      return null;
    }
    return hex;
  }

  update(map: LocalMap, partyHex: Hex, npcs: LocalNpcMarker[]): void {
    this.map = map;
    this.partyHex = partyHex;
    this.dynamicLayer.removeChildren();
    for (const npc of npcs) this.drawNpc(npc);
    this.drawParty();
    this.drawHover();
  }

  handleResize(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
  }

  destroy(): void {
    this.app.canvas.removeEventListener("wheel", this.wheelHandler);
    this.app.destroy({ removeView: true }, { children: true });
  }
}
