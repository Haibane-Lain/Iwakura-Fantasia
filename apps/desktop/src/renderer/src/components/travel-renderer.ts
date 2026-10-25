import { getLocalTile, getPalette } from "@iwakura/content";
import type { Hex, LocalMap, TravelEnemyGroup } from "@iwakura/contracts";
import { axialToOffset, hashString, hexToPixel, localTileAt, type Point, pixelToHex } from "@iwakura/engine";
import { type Application, Container, Graphics, Rectangle } from "pixi.js";
import { addGatehouse } from "../render/iso/buildings";
import { followIsoCamera, screenToWorld } from "../render/iso/camera";
import { IsoLabelLayer, makeLabel } from "../render/iso/labels";
import { mapIsoBounds, tileHeight, tileVariant, timeTint } from "../render/iso/layout";
import { addHexSides, addHexTop, addRibbon, MeshBuilder, meshFrom } from "../render/iso/mesh";
import { projectHex, projectHexCorners, projectPoint, screenVectorToWorld } from "../render/iso/projection";
import { addProp, createFigure, type FigureView } from "../render/iso/props";
import { roadSegments, waterSegments } from "../render/iso/roads";
import { ribbonTexture, terrainSideTexture, terrainTopColor, tileTexture } from "../render/iso/textures";

const HEX_SIZE = 34;
const WALK_SPEED = 190;
const SPRINT_SPEED = 310;
const LABEL_ZOOM = 0.44;
const CAMERA_MIN_ZOOM = 0.55;
const CAMERA_MAX_ZOOM = 2.35;

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

interface CompanionView {
  figure: FigureView;
  label: ReturnType<IsoLabelLayer["add"]>;
  offset: Hex;
}

function offsetHex(hex: Hex, q: number, r: number): Hex {
  return { q: hex.q + q, r: hex.r + r };
}

function nearestFacing(dx: number, dy: number): number {
  const directions = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  const length = Math.hypot(dx, dy) || 1;
  let best = 0;
  let bestDot = -Infinity;
  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[index]!;
    const dot = (dx / length) * direction.q + (dy / length) * direction.r;
    if (dot > bestDot) {
      bestDot = dot;
      best = index;
    }
  }
  return best;
}

export class TravelRenderer {
  private readonly camera = new Container();
  private readonly terrainLayer = new Container();
  private readonly decalLayer = new Container();
  private readonly overlayLayer = new Graphics();
  private readonly aggroLayer = new Graphics();
  private readonly objectLayer = new Container();
  private readonly tintLayer = new Graphics();
  private readonly labels: IsoLabelLayer;
  private readonly keys = new Set<string>();
  private readonly callbacks: TravelRendererCallbacks;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private readonly keyDown: (event: KeyboardEvent) => void;
  private readonly keyUp: (event: KeyboardEvent) => void;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private playerPixel: Point;
  private readonly mapBounds: ReturnType<typeof mapIsoBounds>;
  private playerHex: Hex;
  private scale = 1;
  private hoverHex: Hex | null = null;
  private paused = false;
  private lastFacing = 0;
  private destroyed = false;
  private elapsed = 0;
  private hour: number;
  private reduceMotion: boolean;
  private playerFigure!: FigureView;
  private playerLabel!: ReturnType<IsoLabelLayer["add"]>;
  private readonly companionViews: CompanionView[] = [];
  private readonly figures: FigureView[] = [];

  constructor(
    private readonly app: Application,
    private readonly map: LocalMap,
    partyHex: Hex,
    private readonly partyName: string,
    companions: TravelCompanionMarker[],
    private readonly enemies: TravelEnemyGroup[],
    callbacks: TravelRendererCallbacks,
    hour = 12,
    reduceMotion = false,
  ) {
    this.playerHex = partyHex;
    this.playerPixel = hexToPixel(partyHex, HEX_SIZE);
    this.mapBounds = mapIsoBounds(map, HEX_SIZE, 74);
    this.callbacks = callbacks;
    this.hour = hour;
    this.reduceMotion = reduceMotion;

    this.objectLayer.sortableChildren = true;
    this.app.stage.addChild(this.camera);
    this.camera.addChild(
      this.terrainLayer,
      this.decalLayer,
      this.aggroLayer,
      this.overlayLayer,
      this.objectLayer,
      this.tintLayer,
    );
    this.labels = new IsoLabelLayer(app);

    this.drawTerrain();
    this.drawRoads();
    this.drawProps();
    this.drawMarkers();
    this.drawEnemies();
    this.drawParty(companions);
    this.drawTint();
    this.bindInput();
    this.focusCamera();
    window.requestAnimationFrame(() => {
      if (!this.destroyed) this.focusCamera();
    });

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

  setHour(hour: number): void {
    this.hour = hour;
    this.drawTint();
  }

  setReduceMotion(reduceMotion: boolean): void {
    this.reduceMotion = reduceMotion;
    if (reduceMotion) {
      for (const figure of this.figures) figure.body.y = 0;
    }
  }

  private drawTerrain(): void {
    const background = new Graphics();
    const corners = [
      { col: 0, row: 0 },
      { col: this.map.width - 1, row: 0 },
      { col: this.map.width - 1, row: this.map.height - 1 },
      { col: 0, row: this.map.height - 1 },
    ].map((point) =>
      projectPoint(hexToPixel({ q: point.col - Math.floor(point.row / 2), r: point.row }, HEX_SIZE)),
    );
    background
      .poly(
        corners.flatMap((point) => [point.x, point.y]),
        true,
      )
      .fill({ color: 0x050504, alpha: 0.48 });
    this.terrainLayer.addChild(background);

    const topGroups = new Map<string, { tileId: string; variant: number; builder: MeshBuilder }>();
    const sideGroups = new Map<string, { tileId: string; variant: number; builder: MeshBuilder }>();

    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const tileId = localTileAt(this.map, hex);
        const variant = tileVariant(this.map.id, hex, tileId);
        const key = `${tileId}:${variant}`;
        let top = topGroups.get(key);
        if (!top) {
          top = { tileId, variant, builder: new MeshBuilder() };
          topGroups.set(key, top);
        }
        const z = tileHeight(tileId);
        addHexTop(top.builder, hex, HEX_SIZE, z);
        if (z > 0) {
          let side = sideGroups.get(key);
          if (!side) {
            side = { tileId, variant, builder: new MeshBuilder() };
            sideGroups.set(key, side);
          }
          addHexSides(side.builder, hex, HEX_SIZE, z);
        }
      }
    }

    for (const group of topGroups.values()) {
      const color = getLocalTile(group.tileId).color;
      const mesh = meshFrom(
        group.builder,
        tileTexture(group.tileId, terrainTopColor(group.tileId, color), group.variant),
      );
      if (mesh) this.terrainLayer.addChild(mesh);
    }
    for (const group of sideGroups.values()) {
      const color = getLocalTile(group.tileId).color;
      const mesh = meshFrom(group.builder, terrainSideTexture(group.tileId, color, group.variant));
      if (mesh) this.terrainLayer.addChild(mesh);
    }
  }

  private drawRoads(): void {
    const roadShadow = new MeshBuilder();
    const roadSurface = new MeshBuilder();
    const bridgeSurface = new MeshBuilder();
    const waterSurface = new MeshBuilder();

    for (const segment of roadSegments(this.map)) {
      const center = projectHex(segment.from, HEX_SIZE, 0.04);
      const target = projectHex(segment.to, HEX_SIZE, 0.04);
      addRibbon(roadShadow, center, target, { width: 16 });
      addRibbon(segment.bridge ? bridgeSurface : roadSurface, center, target, { width: 11 });
    }
    for (const segment of waterSegments(this.map)) {
      addRibbon(
        waterSurface,
        projectHex(segment.from, HEX_SIZE, 0.02),
        projectHex(segment.to, HEX_SIZE, 0.02),
        {
          width: 26,
        },
      );
    }

    const shadow = meshFrom(roadShadow, ribbonTexture("road", 0x3f3428));
    if (shadow) {
      shadow.alpha = 0.72;
      this.decalLayer.addChild(shadow);
    }
    const road = meshFrom(roadSurface, ribbonTexture("road", getLocalTile("road").color));
    if (road) this.decalLayer.addChild(road);
    const bridge = meshFrom(bridgeSurface, ribbonTexture("road", getLocalTile("bridge").color));
    if (bridge) this.decalLayer.addChild(bridge);
    const water = meshFrom(waterSurface, ribbonTexture("water", getLocalTile("water").color));
    if (water) {
      water.alpha = 0.55;
      this.decalLayer.addChild(water);
    }
  }

  private drawProps(): void {
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const tileId = localTileAt(this.map, hex);
        const seed = hashString(`${this.map.id}:props:${hex.q}:${hex.r}:${tileId}`);
        const z = tileHeight(tileId);
        const base = projectHex(hex, HEX_SIZE, z);
        if (tileId === "tree") {
          const count = 2 + (seed % 2);
          for (let index = 0; index < count; index += 1) {
            const angle = (index / count) * Math.PI * 2 + (seed % 17) * 0.13;
            const radius = 4 + ((seed >> (index * 3)) % 9);
            const point = {
              x: base.x + Math.cos(angle) * radius,
              y: base.y + Math.sin(angle) * radius * 0.42,
            };
            const kind = seed % 5 === 0 ? "pine" : "tree";
            const sprite = addProp(this.objectLayer, kind, point, {
              scale: 0.52 + ((seed >> (index * 2)) % 15) / 100,
              variant: seed % 3,
            });
            sprite.zIndex = point.y;
          }
        } else if (tileId === "brush" || tileId === "marsh" || (tileId === "grass" && seed % 7 === 0)) {
          const sprite = addProp(
            this.objectLayer,
            "bush",
            { x: base.x, y: base.y },
            {
              scale: tileId === "marsh" ? 0.34 : 0.28,
              variant: seed % 3,
            },
          );
          sprite.zIndex = base.y;
        } else if (tileId === "rock" || tileId === "cliff") {
          const sprite = addProp(
            this.objectLayer,
            "rock",
            { x: base.x, y: base.y },
            {
              scale: tileId === "cliff" ? 0.8 : 0.62,
              variant: seed % 3,
            },
          );
          sprite.zIndex = base.y;
        } else if (tileId === "ruin_floor" && seed % 3 === 0) {
          const sprite = addProp(this.objectLayer, seed % 2 === 0 ? "crate" : "rock", base, {
            scale: 0.3,
            variant: seed % 3,
          });
          sprite.zIndex = base.y;
        } else if (tileId === "water" && seed % 11 === 0) {
          const sprite = addProp(
            this.objectLayer,
            "glow",
            { x: base.x, y: base.y - 2 },
            {
              scale: 0.22,
              alpha: 0.22,
              variant: 0,
            },
          );
          sprite.zIndex = base.y;
        }
      }
    }
  }

  private drawMarkers(): void {
    for (const building of this.map.buildings) {
      const kind =
        building.kind === "gate"
          ? "town"
          : building.kind === "other"
            ? "other"
            : building.kind === "workshop"
              ? "village"
              : "town";
      addGatehouse(this.objectLayer, building.hex, HEX_SIZE, kind);
      const point = projectHex(building.hex, HEX_SIZE, 48);
      const label = makeLabel(building.name, { color: 0xf0e7d2, size: 9 });
      this.labels.add(label, point, { anchorY: 1, offsetY: -2, minZoom: LABEL_ZOOM });
    }

    for (const exit of this.map.exits) {
      const point = projectHex(exit.hex, HEX_SIZE, 0.12);
      const marker = new Graphics();
      marker
        .poly([point.x, point.y - 9, point.x + 8, point.y, point.x, point.y + 8, point.x - 8, point.y], true)
        .fill({ color: 0x8fb5b6, alpha: 0.92 })
        .stroke({ color: 0x080706, width: 1.4 });
      marker.circle(point.x, point.y, 2.4).fill({ color: 0xe8f2ee, alpha: 0.9 });
      marker.zIndex = point.y;
      this.objectLayer.addChild(marker);
      const label = makeLabel(exit.name, { color: 0xb9d0cd, size: 8 });
      this.labels.add(label, point, { anchorY: 0, offsetY: 10, minZoom: LABEL_ZOOM });
    }

    for (const interactable of this.map.interactables) {
      if (
        this.map.buildings.some(
          (building) => building.hex.q === interactable.hex.q && building.hex.r === interactable.hex.r,
        )
      ) {
        continue;
      }
      const point = projectHex(interactable.hex, HEX_SIZE, 0.1);
      const marker = new Graphics();
      marker
        .rect(point.x - 5, point.y - 5, 10, 10)
        .fill({ color: 0xc9a35a, alpha: 0.92 })
        .stroke({ color: 0x080706, width: 1.2 });
      marker.zIndex = point.y;
      this.objectLayer.addChild(marker);
      const label = makeLabel(interactable.name, { color: 0xe8dcc0, size: 8 });
      this.labels.add(label, point, { anchorY: 0, offsetY: 10, minZoom: LABEL_ZOOM });
    }
  }

  private drawEnemies(): void {
    const palette = getPalette("ember");
    for (const group of this.enemies) {
      const point = projectHex(group.hex, HEX_SIZE, tileHeight(localTileAt(this.map, group.hex)));
      const figure = createFigure(palette, { enemy: true, seed: group.id });
      figure.container.position.set(point.x, point.y);
      figure.container.zIndex = point.y;
      this.objectLayer.addChild(figure.container);
      this.figures.push(figure);
      const label = makeLabel(group.name, { color: 0xe0b0aa, size: 8 });
      this.labels.add(label, point, { anchorY: 0, offsetY: 10, minZoom: LABEL_ZOOM });

      const radius = group.aggroRadius * HEX_SIZE * 0.58;
      this.aggroLayer
        .ellipse(point.x, point.y, radius, radius * 0.52)
        .fill({ color: 0x8e3d36, alpha: 0.045 })
        .stroke({ color: 0x8e3d36, width: 0.8, alpha: 0.16 });
    }
  }

  private drawParty(companions: TravelCompanionMarker[]): void {
    const palette = getPalette("gold");
    const point = projectHex(this.playerHex, HEX_SIZE, tileHeight(localTileAt(this.map, this.playerHex)));
    this.playerFigure = createFigure(palette, { seed: this.partyName });
    this.playerFigure.container.position.set(point.x, point.y);
    this.playerFigure.container.zIndex = point.y;
    this.objectLayer.addChild(this.playerFigure.container);
    this.figures.push(this.playerFigure);
    this.playerLabel = this.labels.add(makeLabel(this.partyName, { color: 0xf5e6c8, size: 9 }), point, {
      anchorY: 0,
      offsetY: 10,
      minZoom: LABEL_ZOOM,
    });

    const offsets: Hex[] = [
      { q: -1, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: -1 },
    ];
    for (const [index, companion] of companions.entries()) {
      const offset = offsets[index % offsets.length]!;
      const companionPalette = getPalette(companion.palette);
      const figure = createFigure(companionPalette, { companion: true, seed: companion.id });
      const hex = offsetHex(this.playerHex, offset.q, offset.r);
      const companionPoint = projectHex(hex, HEX_SIZE, tileHeight(localTileAt(this.map, hex)));
      figure.container.position.set(companionPoint.x, companionPoint.y);
      figure.container.zIndex = companionPoint.y;
      this.objectLayer.addChild(figure.container);
      this.figures.push(figure);
      const initials = companion.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] ?? "")
        .join("");
      const label = this.labels.add(makeLabel(initials, { color: 0xf0e7d2, size: 7 }), companionPoint, {
        anchorY: 0,
        offsetY: 9,
        minZoom: LABEL_ZOOM,
      });
      this.companionViews.push({ figure, label, offset });
    }
  }

  private drawTint(): void {
    this.tintLayer.clear();
    const tint = timeTint(this.hour);
    this.tintLayer
      .rect(
        this.mapBounds.minX,
        this.mapBounds.minY,
        this.mapBounds.maxX - this.mapBounds.minX,
        this.mapBounds.maxY - this.mapBounds.minY,
      )
      .fill({ color: tint.color, alpha: tint.alpha });
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
    this.elapsed += deltaMS;
    let screenX = 0;
    let screenY = 0;
    if (this.keys.has("a")) screenX -= 1;
    if (this.keys.has("d")) screenX += 1;
    if (this.keys.has("w")) screenY -= 1;
    if (this.keys.has("s")) screenY += 1;

    if (screenX !== 0 || screenY !== 0) {
      const length = Math.hypot(screenX, screenY);
      const speed = this.keys.has("shift") ? SPRINT_SPEED : WALK_SPEED;
      const screenDistance = (speed * deltaMS) / 1000;
      const worldDelta = screenVectorToWorld(
        (screenX / length) * screenDistance,
        (screenY / length) * screenDistance,
      );
      const next = {
        x: this.playerPixel.x + worldDelta.x,
        y: this.playerPixel.y + worldDelta.y,
      };
      if (this.canStand(next.x, next.y)) {
        this.playerPixel = next;
      } else if (this.canStand(next.x, this.playerPixel.y)) {
        this.playerPixel = { x: next.x, y: this.playerPixel.y };
      } else if (this.canStand(this.playerPixel.x, next.y)) {
        this.playerPixel = { x: this.playerPixel.x, y: next.y };
      }
      const facing = nearestFacing(worldDelta.x, worldDelta.y);
      if (facing !== this.lastFacing) {
        this.lastFacing = facing;
        this.playerFigure.body.scale.x = facing >= 3 ? -1 : 1;
        this.callbacks.onFacing(facing);
      }
    }

    const tileId = localTileAt(this.map, this.playerHex);
    const playerPoint = projectPoint(this.playerPixel, tileHeight(tileId));
    this.playerFigure.container.position.set(playerPoint.x, playerPoint.y);
    this.playerFigure.container.zIndex = playerPoint.y;
    this.labels.setPoint(this.playerLabel, playerPoint);

    for (const view of this.companionViews) {
      const hex = offsetHex(this.playerHex, view.offset.q, view.offset.r);
      const point = projectHex(hex, HEX_SIZE, tileHeight(localTileAt(this.map, hex)));
      view.figure.container.position.set(point.x, point.y);
      view.figure.container.zIndex = point.y;
      this.labels.setPoint(view.label, point);
    }

    if (!this.reduceMotion) {
      for (const figure of this.figures) {
        figure.body.y = Math.sin(this.elapsed * 0.003 + figure.phase) * 0.8;
      }
    }

    const hex = pixelToHex(this.playerPixel, HEX_SIZE);
    if (hex.q !== this.playerHex.q || hex.r !== this.playerHex.r) {
      this.playerHex = hex;
      this.callbacks.onAnchor(hex);
    }
    this.focusCamera();
    this.labels.update(this.camera);
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

  private focusCamera(): void {
    const point = projectPoint(this.playerPixel, tileHeight(localTileAt(this.map, this.playerHex)));
    followIsoCamera(this.app, this.camera, this.mapBounds, point);
    this.labels.update(this.camera);
  }

  handleResize(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.focusCamera();
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const before = {
      x: (x - this.camera.position.x) / this.camera.scale.x,
      y: (y - this.camera.position.y) / this.camera.scale.y,
    };
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    this.scale = Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, this.scale * factor));
    this.camera.scale.set(this.scale);
    this.camera.position.set(x - before.x * this.scale, y - before.y * this.scale);
    this.focusCamera();
    this.labels.update(this.camera);
  }

  private bindInput(): void {
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.app.stage.on("pointermove", (event) => {
      const world = screenToWorld(this.camera, event.global.x, event.global.y);
      const hex = pixelToHex(world, HEX_SIZE);
      const offset = axialToOffset(hex);
      const bounded =
        offset.col >= 0 && offset.col < this.map.width && offset.row >= 0 && offset.row < this.map.height
          ? hex
          : null;
      if (bounded?.q === this.hoverHex?.q && bounded?.r === this.hoverHex?.r) return;
      this.hoverHex = bounded;
      this.callbacks.onHover(bounded);
      this.drawHover();
    });
    this.app.stage.on("pointerleave", () => {
      this.hoverHex = null;
      this.callbacks.onHover(null);
      this.drawHover();
    });
  }

  private drawHover(): void {
    this.overlayLayer.clear();
    if (!this.hoverHex) return;
    const z = tileHeight(localTileAt(this.map, this.hoverHex)) + 0.05;
    const points = projectHexCorners(this.hoverHex, HEX_SIZE, z, 1.4);
    this.overlayLayer
      .poly(
        points.flatMap((point) => [point.x, point.y]),
        true,
      )
      .fill({ color: 0xe8c987, alpha: 0.1 })
      .stroke({ color: 0xe8c987, width: 2, alpha: 0.9 });
  }

  destroy(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.app.canvas.removeEventListener("wheel", this.wheelHandler);
    this.labels.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
