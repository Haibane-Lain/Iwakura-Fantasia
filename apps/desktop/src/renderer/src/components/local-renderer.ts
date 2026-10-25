import { getLocalTile, getPalette } from "@iwakura/content";
import type { Hex, LocalMap } from "@iwakura/contracts";
import { axialToOffset, findPath, hashString, hexToPixel, localTileAt, pixelToHex } from "@iwakura/engine";
import { type Application, Container, type FederatedPointerEvent, Graphics, Rectangle } from "pixi.js";
import { addBuildingVisuals, type BuildingVisual } from "../render/iso/buildings";
import { clampIsoCamera, fitIsoCamera, screenToWorld } from "../render/iso/camera";
import { IsoLabelLayer, type LabelEntry, makeLabel } from "../render/iso/labels";
import { mapIsoBounds, tileHeight, tileVariant, timeTint } from "../render/iso/layout";
import { addHexSides, addHexTop, addRibbon, MeshBuilder, meshFrom } from "../render/iso/mesh";
import { type IsoPoint, projectHex, projectHexCorners, projectPoint } from "../render/iso/projection";
import { addProp, createFigure, type FigureView } from "../render/iso/props";
import { roadSegments, waterSegments } from "../render/iso/roads";
import { ribbonTexture, terrainSideTexture, terrainTopColor, tileTexture } from "../render/iso/textures";

const HEX_SIZE = 34;
const LABEL_ZOOM = 0.38;

export interface LocalNpcMarker {
  id: string;
  name: string;
  hex: Hex;
  palette: string;
  activity: string;
  kind?: "npc" | "enemy" | "companion";
  active?: boolean;
}

export interface LocalRendererCallbacks {
  onSelect: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
}

export class LocalRenderer {
  private map: LocalMap;
  private partyHex: Hex;
  private readonly camera = new Container();
  private readonly terrainLayer = new Container();
  private readonly decalLayer = new Container();
  private readonly overlayLayer = new Graphics();
  private readonly objectLayer = new Container();
  private readonly tintLayer = new Graphics();
  private readonly labels: IsoLabelLayer;
  private readonly callbacks: LocalRendererCallbacks;
  private mapBounds: ReturnType<typeof mapIsoBounds>;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private unitContainers: Container[] = [];
  private unitLabels: LabelEntry[] = [];
  private figures: FigureView[] = [];
  private buildingVisuals: BuildingVisual[] = [];
  private hoverHex: Hex | null = null;
  private dragging = false;
  private dragDistance = 0;
  private lastPointer = { x: 0, y: 0 };
  private minScale = 0.3;
  private maxScale = 3;
  private elapsed = 0;
  private hour: number;
  private partyActive = false;
  private partyRing: Graphics | null = null;
  private reduceMotion: boolean;
  private destroyed = false;

  constructor(
    private readonly app: Application,
    map: LocalMap,
    partyHex: Hex,
    npcs: LocalNpcMarker[],
    callbacks: LocalRendererCallbacks,
    hour = 12,
    partyActive = false,
    reduceMotion = false,
  ) {
    this.map = map;
    this.partyHex = partyHex;
    this.hour = hour;
    this.partyActive = partyActive;
    this.reduceMotion = reduceMotion;
    this.mapBounds = mapIsoBounds(map, HEX_SIZE, 56);
    this.callbacks = callbacks;

    this.objectLayer.sortableChildren = true;
    this.app.stage.addChild(this.camera);
    this.camera.addChild(
      this.terrainLayer,
      this.decalLayer,
      this.overlayLayer,
      this.objectLayer,
      this.tintLayer,
    );
    this.labels = new IsoLabelLayer(app);

    this.buildStatic();
    this.update(map, partyHex, npcs);
    this.bindInput();
    this.fitToScreen();
    this.wheelHandler = (event) => this.onWheel(event);
    this.app.canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
    this.tick = (ticker) => {
      if (this.destroyed) return;
      this.elapsed += ticker.deltaMS;
      if (!this.reduceMotion) {
        for (const figure of this.figures) {
          figure.body.y = Math.sin(this.elapsed * 0.003 + figure.phase) * 0.7;
        }
      }
      this.labels.update(this.camera);
    };
    this.app.ticker.add(this.tick);
  }

  setHour(hour: number): void {
    this.hour = hour;
    this.drawTint();
  }

  setPartyActive(active: boolean): void {
    if (this.partyActive === active) return;
    this.partyActive = active;
    this.drawPartyRing();
  }

  setReduceMotion(reduceMotion: boolean): void {
    this.reduceMotion = reduceMotion;
    if (reduceMotion) {
      for (const figure of this.figures) figure.body.y = 0;
    }
  }

  private clearLayer(layer: Container): void {
    for (const child of layer.removeChildren()) child.destroy({ children: true });
  }

  private buildStatic(): void {
    this.clearLayer(this.terrainLayer);
    this.clearLayer(this.decalLayer);
    this.clearLayer(this.objectLayer);
    this.buildingVisuals = [];

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
      .fill({ color: 0x050504, alpha: 0.5 });
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

    this.drawRoads();
    this.drawProps();
    this.buildingVisuals = addBuildingVisuals(this.objectLayer, this.map, HEX_SIZE, this.hour);
    for (const visual of this.buildingVisuals) {
      if (!visual.building) continue;
      const label = makeLabel(visual.building.name, { color: 0xf0e7d2, size: 9 });
      this.labels.add(label, visual.label, { anchorY: 1, offsetY: -2, minZoom: LABEL_ZOOM });
      const door = projectHex(visual.building.hex, HEX_SIZE, 0.14);
      const marker = new Graphics();
      marker
        .circle(door.x, door.y, 3.2)
        .fill({ color: 0xe8c987, alpha: 0.95 })
        .stroke({ color: 0x080706, width: 1 });
      marker.zIndex = door.y;
      this.objectLayer.addChild(marker);
    }

    this.drawMarkers();
    this.drawDungeonLight();
    this.drawTint();
  }

  private drawRoads(): void {
    const shadow = new MeshBuilder();
    const road = new MeshBuilder();
    const water = new MeshBuilder();
    for (const segment of roadSegments(this.map)) {
      const from = projectHex(segment.from, HEX_SIZE, 0.04);
      const to = projectHex(segment.to, HEX_SIZE, 0.04);
      addRibbon(shadow, from, to, { width: 16 });
      addRibbon(road, from, to, { width: 11 });
    }
    for (const segment of waterSegments(this.map)) {
      addRibbon(water, projectHex(segment.from, HEX_SIZE, 0.02), projectHex(segment.to, HEX_SIZE, 0.02), {
        width: 25,
      });
    }
    const shadowMesh = meshFrom(shadow, ribbonTexture("road", 0x3f3428));
    if (shadowMesh) {
      shadowMesh.alpha = 0.7;
      this.decalLayer.addChild(shadowMesh);
    }
    const roadMesh = meshFrom(road, ribbonTexture("road", getLocalTile("road").color));
    if (roadMesh) this.decalLayer.addChild(roadMesh);
    const waterMesh = meshFrom(water, ribbonTexture("water", getLocalTile("water").color));
    if (waterMesh) {
      waterMesh.alpha = 0.5;
      this.decalLayer.addChild(waterMesh);
    }
  }

  private drawProps(): void {
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const tileId = localTileAt(this.map, hex);
        if (tileId === "roof") continue;
        const seed = hashString(`${this.map.id}:local-props:${hex.q}:${hex.r}:${tileId}`);
        const base = projectHex(hex, HEX_SIZE, tileHeight(tileId));
        if (tileId === "tree") {
          const count = 2 + (seed % 2);
          for (let index = 0; index < count; index += 1) {
            const angle = (index / count) * Math.PI * 2 + (seed % 19) * 0.11;
            const radius = 3 + ((seed >> (index * 3)) % 8);
            const point = {
              x: base.x + Math.cos(angle) * radius,
              y: base.y + Math.sin(angle) * radius * 0.42,
            };
            const sprite = addProp(this.objectLayer, seed % 4 === 0 ? "pine" : "tree", point, {
              scale: 0.5 + ((seed >> (index * 2)) % 14) / 100,
              variant: seed % 3,
            });
            sprite.zIndex = point.y;
          }
        } else if (tileId === "brush" || tileId === "marsh") {
          const sprite = addProp(this.objectLayer, "bush", base, {
            scale: tileId === "marsh" ? 0.3 : 0.26,
            variant: seed % 3,
          });
          sprite.zIndex = base.y;
        } else if (tileId === "rock" || tileId === "cliff") {
          const sprite = addProp(this.objectLayer, "rock", base, {
            scale: tileId === "cliff" ? 0.72 : 0.56,
            variant: seed % 3,
          });
          sprite.zIndex = base.y;
        } else if (tileId === "crate") {
          const sprite = addProp(this.objectLayer, seed % 2 === 0 ? "crate" : "barrel", base, {
            scale: 0.36,
            variant: seed % 3,
          });
          sprite.zIndex = base.y;
        } else if (tileId === "ruin_floor" && seed % 4 === 0) {
          const sprite = addProp(this.objectLayer, "rock", base, { scale: 0.3, variant: seed % 3 });
          sprite.zIndex = base.y;
        } else if (tileId === "altar") {
          this.drawAltar(base);
        } else if (tileId === "stairs") {
          this.drawStairs(base);
        } else if (tileId === "water" && seed % 9 === 0) {
          const sprite = addProp(
            this.objectLayer,
            "glow",
            { x: base.x, y: base.y - 1 },
            {
              scale: 0.18,
              alpha: 0.2,
              variant: 0,
            },
          );
          sprite.zIndex = base.y;
        }
      }
    }
  }

  private drawAltar(point: IsoPoint): void {
    const altar = new Graphics();
    altar
      .poly(
        [
          point.x - 13,
          point.y - 2,
          point.x + 10,
          point.y - 8,
          point.x + 15,
          point.y - 2,
          point.x - 8,
          point.y + 4,
        ],
        true,
      )
      .fill({ color: 0x8a7f8f, alpha: 0.95 })
      .stroke({ color: 0x3d3445, width: 1.4 });
    altar
      .poly(
        [
          point.x - 13,
          point.y - 2,
          point.x - 8,
          point.y + 4,
          point.x - 8,
          point.y + 10,
          point.x - 13,
          point.y + 4,
        ],
        true,
      )
      .fill({ color: 0x5f5568 });
    altar.zIndex = point.y;
    this.objectLayer.addChild(altar);
  }

  private drawStairs(point: IsoPoint): void {
    const stairs = new Graphics();
    for (let step = 0; step < 4; step += 1) {
      stairs
        .rect(point.x - 12 + step * 2, point.y - 4 + step * 2.4, 24 - step * 4, 3)
        .fill({ color: 0xb08d58, alpha: 0.9 })
        .stroke({ color: 0x4a3522, width: 0.8 });
    }
    stairs.zIndex = point.y;
    this.objectLayer.addChild(stairs);
  }

  private drawMarkers(): void {
    for (const exit of this.map.exits) {
      const point = projectHex(exit.hex, HEX_SIZE, 0.12);
      const marker = new Graphics();
      marker
        .poly([point.x, point.y - 9, point.x + 8, point.y, point.x, point.y + 8, point.x - 8, point.y], true)
        .fill({ color: 0x8fb5b6, alpha: 0.9 })
        .stroke({ color: 0x080706, width: 1.4 });
      marker.circle(point.x, point.y, 2.3).fill({ color: 0xe8f2ee, alpha: 0.9 });
      marker.zIndex = point.y;
      this.objectLayer.addChild(marker);
      const label = makeLabel(exit.name, { color: 0xb9d0cd, size: 8 });
      this.labels.add(label, point, { anchorY: 0, offsetY: 10, minZoom: LABEL_ZOOM });
    }

    for (const interactable of this.map.interactables) {
      const point = projectHex(interactable.hex, HEX_SIZE, 0.12);
      const marker = new Graphics();
      if (interactable.kind === "sign") {
        marker.rect(point.x - 1.5, point.y - 14, 3, 14).fill({ color: 0x5d4229 });
        marker
          .rect(point.x - 8, point.y - 18, 16, 8)
          .fill({ color: 0x9a7a4c, alpha: 0.95 })
          .stroke({ color: 0x2e2116, width: 1 });
      } else if (interactable.kind === "altar" || interactable.kind === "shrine") {
        marker
          .poly(
            [point.x - 8, point.y - 2, point.x, point.y - 10, point.x + 8, point.y - 2, point.x, point.y + 6],
            true,
          )
          .fill({ color: 0x8a7f8f, alpha: 0.95 })
          .stroke({ color: 0x3d3445, width: 1.2 });
      } else if (interactable.kind === "stairs") {
        marker
          .rect(point.x - 8, point.y - 6, 16, 4)
          .fill({ color: 0xb08d58 })
          .rect(point.x - 6, point.y - 2, 12, 4)
          .fill({ color: 0x9c7a4b });
      } else if (interactable.kind === "chest") {
        marker
          .rect(point.x - 7, point.y - 10, 14, 10)
          .fill({ color: 0x7c5b39 })
          .stroke({ color: 0x2e2116, width: 1.2 });
      } else {
        marker
          .rect(point.x - 6, point.y - 6, 12, 12)
          .fill({ color: 0xc9a35a, alpha: 0.92 })
          .stroke({ color: 0x080706, width: 1.2 });
      }
      marker.zIndex = point.y;
      this.objectLayer.addChild(marker);
      const label = makeLabel(interactable.name, { color: 0xe8dcc0, size: 8 });
      this.labels.add(label, point, { anchorY: 0, offsetY: 10, minZoom: LABEL_ZOOM });
    }
  }

  private drawDungeonLight(): void {
    if (this.map.kind !== "dungeon") return;
    let index = 0;
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        if (localTileAt(this.map, hex) !== "stone_wall") continue;
        index += 1;
        if (index % 7 !== 0) continue;
        const point = projectHex(hex, HEX_SIZE, 0.6);
        const glow = addProp(this.objectLayer, "glow", point, { scale: 0.7, alpha: 0.45, variant: 0 });
        glow.zIndex = point.y - 0.1;
      }
    }
  }

  private drawTint(): void {
    this.tintLayer.clear();
    const tint =
      this.map.kind === "dungeon"
        ? { color: 0x10192b, alpha: 0.3, blend: "normal" as const }
        : timeTint(this.hour);
    this.tintLayer
      .rect(
        this.mapBounds.minX,
        this.mapBounds.minY,
        this.mapBounds.maxX - this.mapBounds.minX,
        this.mapBounds.maxY - this.mapBounds.minY,
      )
      .fill({ color: tint.color, alpha: tint.alpha });
  }

  private clearUnits(): void {
    for (const container of this.unitContainers) {
      this.objectLayer.removeChild(container);
      container.destroy({ children: true });
    }
    this.unitContainers = [];
    for (const label of this.unitLabels) this.labels.remove(label);
    this.unitLabels = [];
    this.figures = [];
    this.partyRing = null;
  }

  private drawNpc(npc: LocalNpcMarker): void {
    const point = projectHex(npc.hex, HEX_SIZE, tileHeight(localTileAt(this.map, npc.hex)));
    const palette = getPalette(npc.palette);
    const figure = createFigure(palette, {
      enemy: npc.kind === "enemy",
      companion: npc.kind === "companion",
      seed: npc.id,
    });
    figure.container.position.set(point.x, point.y);
    figure.container.zIndex = point.y;
    this.objectLayer.addChild(figure.container);
    this.unitContainers.push(figure.container);
    this.figures.push(figure);

    if (npc.active) {
      const ring = new Graphics();
      ring.ellipse(point.x, point.y, 15, 6).stroke({ color: 0xe8c987, width: 2, alpha: 0.9 });
      ring.zIndex = point.y - 0.1;
      this.objectLayer.addChild(ring);
      this.unitContainers.push(ring);
    }

    const label = makeLabel(npc.name, {
      color: npc.kind === "enemy" ? 0xe0b0aa : 0xe9dfc8,
      size: 8,
    });
    const stagger = (hashString(npc.id) % 3) * 7;
    const entry = this.labels.add(label, point, {
      anchorY: 1,
      offsetY: -40 - stagger,
      minZoom: LABEL_ZOOM,
    });
    this.unitLabels.push(entry);
  }

  private drawParty(): void {
    const point = projectHex(this.partyHex, HEX_SIZE, tileHeight(localTileAt(this.map, this.partyHex)));
    const palette = getPalette("gold");
    const figure = createFigure(palette, { seed: "party" });
    figure.container.position.set(point.x, point.y);
    figure.container.zIndex = point.y;
    this.objectLayer.addChild(figure.container);
    this.unitContainers.push(figure.container);
    this.figures.push(figure);
    const label = makeLabel("You", { color: 0xf5e6c8, size: 8 });
    const entry = this.labels.add(label, point, { anchorY: 0, offsetY: 10, minZoom: LABEL_ZOOM });
    this.unitLabels.push(entry);
    if (this.partyActive) this.drawPartyRing();
  }

  private drawPartyRing(): void {
    if (this.partyRing) {
      const index = this.unitContainers.indexOf(this.partyRing);
      if (index >= 0) this.unitContainers.splice(index, 1);
      this.partyRing.destroy();
      this.partyRing = null;
    }
    if (!this.partyActive) return;
    const point = projectHex(this.partyHex, HEX_SIZE, tileHeight(localTileAt(this.map, this.partyHex)));
    const ring = new Graphics();
    ring.ellipse(point.x, point.y, 16, 6.5).stroke({ color: 0xe8c987, width: 2.2, alpha: 0.95 });
    ring.zIndex = point.y - 0.2;
    this.objectLayer.addChild(ring);
    this.unitContainers.push(ring);
    this.partyRing = ring;
  }

  private drawHover(): void {
    this.overlayLayer.clear();
    const hex = this.hoverHex;
    if (!hex) return;
    const z = tileHeight(localTileAt(this.map, hex)) + 0.05;
    const center = projectHex(hex, HEX_SIZE, z);
    const walkable = getLocalTile(localTileAt(this.map, hex)).walkable;
    const route = findPath(this.partyHex, hex, (h) => (this.isWalkable(h) ? 1 : null));
    const points = projectHexCorners(hex, HEX_SIZE, z, 1.4);
    if (!route) {
      this.overlayLayer
        .poly(
          points.flatMap((point) => [point.x, point.y]),
          true,
        )
        .stroke({ color: 0x8e3d36, width: 2 });
      return;
    }
    if (walkable) {
      this.overlayLayer
        .poly(
          points.flatMap((point) => [point.x, point.y]),
          true,
        )
        .fill({ color: 0xe8c987, alpha: 0.1 })
        .stroke({ color: 0xe8c987, width: 2 });
    }
    let previous = projectHex(
      this.partyHex,
      HEX_SIZE,
      tileHeight(localTileAt(this.map, this.partyHex)) + 0.06,
    );
    for (const step of route.path) {
      const next = projectHex(step, HEX_SIZE, tileHeight(localTileAt(this.map, step)) + 0.06);
      this.overlayLayer
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({ color: 0x080706, width: 6, alpha: 0.42 })
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({ color: 0xe8c987, width: 2.2, alpha: 0.9 });
      previous = next;
    }
    void center;
  }

  private isWalkable(hex: Hex): boolean {
    return getLocalTile(localTileAt(this.map, hex)).walkable;
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
        clampIsoCamera(this.app, this.camera, this.mapBounds);
        this.lastPointer = { x: event.global.x, y: event.global.y };
        this.labels.update(this.camera);
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
      this.overlayLayer.clear();
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
    const before = {
      x: (x - this.camera.position.x) / this.camera.scale.x,
      y: (y - this.camera.position.y) / this.camera.scale.y,
    };
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    const next = Math.max(this.minScale * 0.55, Math.min(this.maxScale, this.camera.scale.x * factor));
    this.camera.scale.set(next);
    this.camera.position.set(x - before.x * next, y - before.y * next);
    clampIsoCamera(this.app, this.camera, this.mapBounds);
    this.labels.update(this.camera);
    this.updateHover(x, y);
  }

  private fitToScreen(): void {
    const focus = projectHex(this.partyHex, HEX_SIZE, tileHeight(localTileAt(this.map, this.partyHex)));
    const initialScale = fitIsoCamera(this.app, this.camera, this.mapBounds, focus, {
      padding: 42,
      minScale: 0.55,
      maxScale: 1.85,
    });
    this.minScale = Math.max(0.3, initialScale * 0.65);
    this.maxScale = Math.max(2.6, initialScale * 3.2);
    this.labels.update(this.camera);
  }

  private hexAt(screenX: number, screenY: number): Hex | null {
    const world = screenToWorld(this.camera, screenX, screenY);
    const hex = pixelToHex(world, HEX_SIZE);
    const offset = axialToOffset(hex);
    if (offset.col < 0 || offset.col >= this.map.width || offset.row < 0 || offset.row >= this.map.height) {
      return null;
    }
    return hex;
  }

  update(map: LocalMap, partyHex: Hex, npcs: LocalNpcMarker[]): void {
    if (map.id !== this.map.id) {
      this.clearUnits();
      this.labels.clear();
      this.map = map;
      this.mapBounds = mapIsoBounds(map, HEX_SIZE, 56);
      this.buildStatic();
      this.fitToScreen();
    }
    this.partyHex = partyHex;
    this.clearUnits();
    for (const npc of npcs) this.drawNpc(npc);
    this.drawParty();
    this.drawHover();
    this.labels.update(this.camera);
  }

  handleResize(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.labels.update(this.camera);
  }

  destroy(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.app.canvas.removeEventListener("wheel", this.wheelHandler);
    this.labels.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
