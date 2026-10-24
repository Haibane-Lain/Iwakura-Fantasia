import { getLocalTile, getPalette } from "@iwakura/content";
import type { Hex, LocalMap, TravelEnemyGroup } from "@iwakura/contracts";
import {
  axialToOffset,
  cornerOffset,
  hashString,
  hexToPixel,
  localTileAt,
  offsetToAxial,
  type Point,
  pixelToHex,
} from "@iwakura/engine";
import { type Application, Container, Graphics, Point as PixiPoint, Rectangle, Text } from "pixi.js";

const HEX_SIZE = 34;
const WALK_SPEED = 190;
const SPRINT_SPEED = 310;
const LABEL_ZOOM = 0.55;

function hexPoints(center: { x: number; y: number }, size: number): number[] {
  const points: number[] = [];
  for (let corner = 0; corner < 6; corner += 1) {
    const offset = cornerOffset(corner, size);
    points.push(center.x + offset.x, center.y + offset.y);
  }
  return points;
}

function colorWithVariation(color: number, variation: number): number {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + variation));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + variation));
  const b = Math.max(0, Math.min(255, (color & 0xff) + variation));
  return (r << 16) | (g << 8) | b;
}

function label(text: string, color = 0xe9dfc8, size = 8): Text {
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

export interface TravelCompanionMarker {
  id: string;
  name: string;
  palette: string;
}

export interface TravelRendererCallbacks {
  onAnchor: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
  onFacing: (direction: number) => void;
}

export class TravelRenderer {
  private readonly camera = new Container();
  private readonly terrainLayer = new Graphics();
  private readonly propLayer = new Graphics();
  private readonly markerLayer = new Container();
  private readonly dynamicLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly labels: Array<{ text: Text; hex: Hex }> = [];
  private readonly keys = new Set<string>();
  private readonly callbacks: TravelRendererCallbacks;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private readonly keyDown: (event: KeyboardEvent) => void;
  private readonly keyUp: (event: KeyboardEvent) => void;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private playerPixel: Point;
  private readonly partyOrigin: Point;
  private readonly mapBounds: { minX: number; maxX: number; minY: number; maxY: number };
  private playerHex: Hex;
  private scale = 1.05;
  private hoverHex: Hex | null = null;
  private paused = false;
  private lastFacing = 0;
  private destroyed = false;

  constructor(
    private readonly app: Application,
    private readonly map: LocalMap,
    partyHex: Hex,
    private readonly partyName: string,
    companions: TravelCompanionMarker[],
    private readonly enemies: TravelEnemyGroup[],
    callbacks: TravelRendererCallbacks,
  ) {
    this.playerHex = partyHex;
    this.playerPixel = hexToPixel(partyHex, HEX_SIZE);
    this.partyOrigin = this.playerPixel;
    this.mapBounds = this.computeMapBounds();
    this.callbacks = callbacks;
    this.app.stage.addChild(this.camera);
    this.camera.addChild(
      this.terrainLayer,
      this.propLayer,
      this.markerLayer,
      this.dynamicLayer,
      this.playerLayer,
    );
    this.drawTerrain();
    this.drawProps();
    this.drawMarkers();
    this.drawEnemies();
    this.drawParty(companions);
    this.bindInput();
    this.focusCamera();
    window.requestAnimationFrame(() => this.focusCamera());
    this.tick = (ticker) => this.update(ticker.deltaMS);
    this.app.ticker.add(this.tick);
    this.keyDown = (event) => this.onKeyDown(event);
    this.keyUp = (event) => this.onKeyUp(event);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    this.wheelHandler = (event) => this.onWheel(event);
    this.app.canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
    this.app.canvas.style.cursor = "default";
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.keys.clear();
  }

  private drawTerrain(): void {
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const center = hexToPixel(hex, HEX_SIZE);
        const tile = getLocalTile(localTileAt(this.map, hex));
        const variation = (hashString(`${this.map.id}:${hex.q}:${hex.r}:${tile.id}`) % 25) - 12;
        this.terrainLayer
          .poly(hexPoints(center, HEX_SIZE), true)
          .fill({ color: colorWithVariation(tile.color, variation), alpha: 1 })
          .stroke({ color: 0x080706, width: 0.7, alpha: 0.2 });
      }
    }
  }

  private drawProps(): void {
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const center = hexToPixel(hex, HEX_SIZE);
        const tile = localTileAt(this.map, hex);
        const seed = hashString(`${this.map.id}:props:${hex.q}:${hex.r}:${tile}`);
        const jitter = (amount: number) => ((seed % (amount * 2 + 1)) - amount) * 0.55;
        if (tile === "tree") {
          this.propLayer
            .ellipse(center.x + jitter(8), center.y + 8, 13, 5)
            .fill({ color: 0x11180f, alpha: 0.28 });
          this.propLayer.rect(center.x - 1.5 + jitter(5), center.y + 1, 3, 12).fill({ color: 0x4b3524 });
          this.propLayer
            .circle(center.x - 4 + jitter(5), center.y - 2, 9)
            .fill({ color: 0x263c24 })
            .circle(center.x + 5 + jitter(5), center.y - 4, 7)
            .fill({ color: 0x344c2c })
            .circle(center.x + 1 + jitter(5), center.y - 10, 6)
            .fill({ color: 0x405a34 });
        } else if (tile === "brush" || tile === "grass" || tile === "field") {
          const tufts = 3 + (seed % 4);
          for (let index = 0; index < tufts; index += 1) {
            const x = center.x + jitter(18);
            const y = center.y + jitter(14);
            this.propLayer
              .moveTo(x, y)
              .lineTo(x + 2, y - 4)
              .stroke({ color: tile === "field" ? 0x9a8a50 : 0x87925f, width: 1, alpha: 0.65 });
          }
          if (seed % 11 === 0) {
            this.propLayer
              .circle(center.x + jitter(15), center.y + jitter(12), 2)
              .fill({ color: 0xc9a35a, alpha: 0.85 });
          }
        } else if (tile === "water") {
          for (let index = 0; index < 3; index += 1) {
            const x = center.x - 13 + index * 9 + jitter(4);
            const y = center.y + jitter(12);
            this.propLayer
              .moveTo(x - 5, y)
              .quadraticCurveTo(x, y - 4, x + 5, y)
              .stroke({ color: 0x7babb5, width: 1, alpha: 0.38 });
          }
        } else if (tile === "marsh") {
          for (let index = 0; index < 4; index += 1) {
            const x = center.x + jitter(16);
            const y = center.y + jitter(12);
            this.propLayer
              .moveTo(x, y + 5)
              .lineTo(x + 1, y - 5)
              .stroke({ color: 0x9ba875, width: 1.2, alpha: 0.65 });
          }
        } else if (tile === "rock" || tile === "cliff") {
          const points = [
            center.x - 11 + jitter(4),
            center.y + 8,
            center.x - 5 + jitter(4),
            center.y - 8,
            center.x + 4 + jitter(4),
            center.y - 5,
            center.x + 12 + jitter(4),
            center.y + 7,
          ];
          this.propLayer
            .poly(points, true)
            .fill({ color: tile === "cliff" ? 0x4a463f : 0x5d574c })
            .stroke({
              color: 0x27251f,
              width: 1,
              alpha: 0.55,
            });
        } else if (tile === "sand" || tile === "snow") {
          for (let index = 0; index < 5; index += 1) {
            this.propLayer
              .circle(center.x + jitter(20), center.y + jitter(16), 0.9)
              .fill({ color: tile === "snow" ? 0xf3f5ef : 0x77683f, alpha: 0.55 });
          }
        } else if (tile === "road" || tile === "plaza") {
          this.propLayer
            .moveTo(center.x - 20, center.y + 4)
            .lineTo(center.x + 20, center.y - 3)
            .stroke({ color: 0x6a5a43, width: 1, alpha: 0.4 });
          this.propLayer
            .moveTo(center.x - 17, center.y - 6)
            .lineTo(center.x + 18, center.y + 5)
            .stroke({ color: 0x6a5a43, width: 0.8, alpha: 0.28 });
        } else if (tile === "crop") {
          for (let index = 0; index < 4; index += 1) {
            this.propLayer
              .moveTo(center.x - 17 + index * 10, center.y - 11)
              .lineTo(center.x - 17 + index * 10, center.y + 11)
              .stroke({ color: 0xb3a35b, width: 2, alpha: 0.55 });
          }
        } else if (tile === "ruin_floor") {
          this.propLayer
            .rect(center.x - 10 + jitter(4), center.y - 2, 8, 5)
            .fill({ color: 0x8a8170, alpha: 0.6 })
            .rect(center.x + 3 + jitter(4), center.y + 4, 7, 4)
            .fill({ color: 0x5b5448, alpha: 0.7 });
        } else if (tile === "high_ground") {
          this.propLayer
            .moveTo(center.x - 16, center.y + 7)
            .quadraticCurveTo(center.x, center.y + 2, center.x + 16, center.y + 7)
            .stroke({ color: 0xa99b77, width: 1.2, alpha: 0.45 });
        }
      }
    }
  }

  private drawMarkers(): void {
    for (const building of this.map.buildings) {
      const center = hexToPixel(building.hex, HEX_SIZE);
      const marker = new Graphics();
      marker
        .rect(center.x - 12, center.y - 8, 24, 16)
        .fill({ color: 0x3b2f25, alpha: 0.95 })
        .stroke({ color: 0xe8c987, width: 1.2, alpha: 0.8 });
      marker.rect(center.x - 3, center.y - 1, 6, 9).fill({ color: 0xc9a35a, alpha: 0.9 });
      this.markerLayer.addChild(marker);
      const text = label(building.name, 0xf0e7d2, 8);
      text.anchor.set(0.5, 1);
      text.position.set(center.x, center.y - 12);
      this.markerLayer.addChild(text);
      this.labels.push({ text, hex: building.hex });
    }
    for (const exit of this.map.exits) {
      const center = hexToPixel(exit.hex, HEX_SIZE);
      const marker = new Graphics();
      marker
        .poly(
          [center.x, center.y - 10, center.x + 9, center.y, center.x, center.y + 10, center.x - 9, center.y],
          true,
        )
        .fill({ color: 0x8fb5b6, alpha: 0.9 })
        .stroke({ color: 0x080706, width: 1.4 });
      marker.circle(center.x, center.y, 3).fill({ color: 0xe8f2ee, alpha: 0.9 });
      this.markerLayer.addChild(marker);
      const text = label(exit.name, 0xb9d0cd, 8);
      text.anchor.set(0.5, 0);
      text.position.set(center.x, center.y + 12);
      this.markerLayer.addChild(text);
      this.labels.push({ text, hex: exit.hex });
    }
    for (const interactable of this.map.interactables) {
      if (
        this.map.buildings.some(
          (building) => building.hex.q === interactable.hex.q && building.hex.r === interactable.hex.r,
        )
      ) {
        continue;
      }
      const center = hexToPixel(interactable.hex, HEX_SIZE);
      const marker = new Graphics();
      marker
        .rect(center.x - 6, center.y - 6, 12, 12)
        .fill({ color: 0xc9a35a, alpha: 0.9 })
        .stroke({ color: 0x080706, width: 1.3 });
      this.markerLayer.addChild(marker);
      const text = label(interactable.name, 0xe8dcc0, 8);
      text.anchor.set(0.5, 0);
      text.position.set(center.x, center.y + 11);
      this.markerLayer.addChild(text);
      this.labels.push({ text, hex: interactable.hex });
    }
  }

  private drawEnemies(): void {
    const palette = getPalette("ember");
    for (const group of this.enemies) {
      const center = hexToPixel(group.hex, HEX_SIZE);
      const marker = new Graphics();
      marker
        .circle(center.x, center.y, group.aggroRadius * HEX_SIZE * 0.34)
        .fill({ color: 0x8e3d36, alpha: 0.06 })
        .stroke({ color: 0x8e3d36, width: 0.8, alpha: 0.12 });
      marker
        .circle(center.x, center.y, 11)
        .fill({ color: palette.cloak })
        .stroke({ color: 0x080706, width: 2 });
      marker.circle(center.x, center.y, 13).stroke({ color: 0xd9a39d, width: 1.2, alpha: 0.8 });
      this.dynamicLayer.addChild(marker);
      const text = label(group.name, 0xe0b0aa, 8);
      text.anchor.set(0.5, 0);
      text.position.set(center.x, center.y + 13);
      this.dynamicLayer.addChild(text);
      this.labels.push({ text, hex: group.hex });
    }
  }

  private drawParty(companions: TravelCompanionMarker[]): void {
    const center = this.playerPixel;
    const shadow = new Graphics();
    shadow.ellipse(center.x, center.y + 8, 13, 5).fill({ color: 0x080706, alpha: 0.4 });
    this.playerLayer.addChild(shadow);
    const token = new Graphics();
    token
      .circle(center.x, center.y, 15)
      .fill({ color: 0xe8c987, alpha: 0.14 })
      .stroke({ color: 0xf5e6c8, width: 1.3 });
    token.circle(center.x, center.y, 8).fill({ color: 0xe8c987 }).stroke({ color: 0x080706, width: 2 });
    token.circle(center.x, center.y, 3).fill({ color: 0x080706 });
    this.playerLayer.addChild(token);
    const text = label(this.partyName, 0xf5e6c8, 8);
    text.anchor.set(0.5, 0);
    text.position.set(center.x, center.y + 16);
    this.playerLayer.addChild(text);
    this.labels.push({ text, hex: this.playerHex });

    const offsets: Array<{ q: number; r: number }> = [
      { q: -1, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: -1 },
    ];
    for (const [index, companion] of companions.entries()) {
      const offset = offsets[index % offsets.length]!;
      const companionHex = {
        q: this.playerHex.q + offset.q,
        r: this.playerHex.r + offset.r,
      };
      const point = hexToPixel(companionHex, HEX_SIZE);
      const palette = getPalette(companion.palette);
      const marker = new Graphics();
      marker
        .circle(point.x, point.y, 9)
        .fill({ color: palette.cloak })
        .stroke({ color: palette.ink, width: 1.5 });
      this.playerLayer.addChild(marker);
      const initials = label(
        companion.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0] ?? "")
          .join(""),
        0xf0e7d2,
        7,
      );
      initials.anchor.set(0.5);
      initials.position.set(point.x, point.y);
      this.playerLayer.addChild(initials);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.paused) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "shift"].includes(key)) {
      event.preventDefault();
      this.keys.add(key);
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "shift"].includes(key)) {
      event.preventDefault();
      this.keys.delete(key);
    }
  }

  private update(deltaMS: number): void {
    if (this.destroyed) return;
    let dx = 0;
    let dy = 0;
    if (this.keys.has("a")) dx -= 1;
    if (this.keys.has("d")) dx += 1;
    if (this.keys.has("w")) dy -= 1;
    if (this.keys.has("s")) dy += 1;
    if (dx === 0 && dy === 0) return;
    const length = Math.hypot(dx, dy);
    const speed = this.keys.has("shift") ? SPRINT_SPEED : WALK_SPEED;
    const distance = (speed * deltaMS) / 1000;
    const next = {
      x: this.playerPixel.x + (dx / length) * distance,
      y: this.playerPixel.y + (dy / length) * distance,
    };
    if (this.canStand(next.x, next.y)) {
      this.playerPixel = next;
    } else if (this.canStand(next.x, this.playerPixel.y)) {
      this.playerPixel = { x: next.x, y: this.playerPixel.y };
    } else if (this.canStand(this.playerPixel.x, next.y)) {
      this.playerPixel = { x: this.playerPixel.x, y: next.y };
    }
    const facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 3 : 0) : dy < 0 ? 2 : 5;
    if (facing !== this.lastFacing) {
      this.lastFacing = facing;
      this.callbacks.onFacing(facing);
    }
    this.playerLayer.position.set(
      this.playerPixel.x - this.partyOrigin.x,
      this.playerPixel.y - this.partyOrigin.y,
    );
    const hex = pixelToHex(this.playerPixel, HEX_SIZE);
    if (hex.q !== this.playerHex.q || hex.r !== this.playerHex.r) {
      this.playerHex = hex;
      this.callbacks.onAnchor(hex);
    }
    this.focusCamera();
  }

  private canStand(x: number, y: number): boolean {
    const hex = pixelToHex({ x, y }, HEX_SIZE);
    const offset = axialToOffset(hex);
    if (
      offset.col < 1 ||
      offset.col >= this.map.width - 1 ||
      offset.row < 1 ||
      offset.row >= this.map.height - 1
    ) {
      return false;
    }
    return getLocalTile(localTileAt(this.map, hex)).walkable;
  }

  private computeMapBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const corners = [
      { col: 0, row: 0 },
      { col: this.map.width - 1, row: 0 },
      { col: 0, row: this.map.height - 1 },
      { col: this.map.width - 1, row: this.map.height - 1 },
    ].map((offset) => hexToPixel(offsetToAxial(offset), HEX_SIZE));
    const halfWidth = HEX_SIZE * 0.9;
    return {
      minX: Math.min(...corners.map((point) => point.x)) - halfWidth,
      maxX: Math.max(...corners.map((point) => point.x)) + halfWidth,
      minY: Math.min(...corners.map((point) => point.y)) - HEX_SIZE,
      maxY: Math.max(...corners.map((point) => point.y)) + HEX_SIZE,
    };
  }

  private focusCamera(): void {
    this.camera.scale.set(this.scale);
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    let x = screenWidth / 2 - this.playerPixel.x * this.scale;
    let y = screenHeight / 2 - this.playerPixel.y * this.scale;
    const mapWidth = (this.mapBounds.maxX - this.mapBounds.minX) * this.scale;
    const mapHeight = (this.mapBounds.maxY - this.mapBounds.minY) * this.scale;
    x =
      mapWidth <= screenWidth
        ? screenWidth / 2 - ((this.mapBounds.minX + this.mapBounds.maxX) / 2) * this.scale
        : Math.max(
            screenWidth - this.mapBounds.maxX * this.scale,
            Math.min(-this.mapBounds.minX * this.scale, x),
          );
    y =
      mapHeight <= screenHeight
        ? screenHeight / 2 - ((this.mapBounds.minY + this.mapBounds.maxY) / 2) * this.scale
        : Math.max(
            screenHeight - this.mapBounds.maxY * this.scale,
            Math.min(-this.mapBounds.minY * this.scale, y),
          );
    this.camera.position.set(x, y);
    for (const entry of this.labels) entry.text.visible = this.scale > LABEL_ZOOM;
  }

  handleResize(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.focusCamera();
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.91;
    this.scale = Math.max(0.5, Math.min(2.3, this.scale * factor));
    this.focusCamera();
  }

  private bindInput(): void {
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.app.stage.on("pointermove", (event) => {
      const local = this.camera.toLocal(new PixiPoint(event.global.x, event.global.y));
      const hex = pixelToHex(local, HEX_SIZE);
      const offset = axialToOffset(hex);
      const bounded =
        offset.col >= 0 && offset.col < this.map.width && offset.row >= 0 && offset.row < this.map.height
          ? hex
          : null;
      if (bounded?.q === this.hoverHex?.q && bounded?.r === this.hoverHex?.r) return;
      this.hoverHex = bounded;
      this.callbacks.onHover(bounded);
    });
    this.app.stage.on("pointerleave", () => {
      this.hoverHex = null;
      this.callbacks.onHover(null);
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.app.canvas.removeEventListener("wheel", this.wheelHandler);
    this.app.destroy({ removeView: true }, { children: true });
  }
}
