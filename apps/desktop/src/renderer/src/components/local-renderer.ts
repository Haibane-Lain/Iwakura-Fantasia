import { getLocalTile } from "@iwakura/content";
import type { Hex, LocalMap } from "@iwakura/contracts";
import { axialToOffset, findPath, hashString, hexToPixel, localTileAt, pixelToHex } from "@iwakura/engine";
import {
  type Application,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  type Sprite,
} from "pixi.js";
import { facingFromVector, facingToward } from "../render/iso/actors/actor-appearance";
import type {
  ActorAppearanceInput,
  ActorPresentation,
  ActorVisualCue,
  PartyActorStatus,
} from "../render/iso/actors/actor-types";
import { ActorView } from "../render/iso/actors/actor-view";
import { AtmosphereFilter } from "../render/iso/atmosphere";
import { drawBackdrop } from "../render/iso/backdrop";
import { addBuildingVisuals, type BuildingVisual } from "../render/iso/buildings";
import { clampIsoCamera, fitIsoCamera, screenToWorld } from "../render/iso/camera";
import { IsoLabelLayer, type LabelEntry, makeLabel } from "../render/iso/labels";
import { mapIsoBounds, tileHeight, tileVariant, timeTint } from "../render/iso/layout";
import { addHexSides, addHexTop, addOrganicRibbon, MeshBuilder, meshFrom } from "../render/iso/mesh";
import { type IsoPoint, projectHex, projectHexCorners, projectPoint } from "../render/iso/projection";
import { addProp } from "../render/iso/props";
import { roadSegments, waterSegments } from "../render/iso/roads";
import {
  animatedWaterTexture,
  ribbonTexture,
  terrainSideTexture,
  terrainTopColor,
  tileTexture,
} from "../render/iso/textures";
import { createShoreline, WaterAnimator } from "../render/iso/water";
import { type GraphicsQuality, WeatherFx, type WeatherSetting } from "../render/iso/weather";

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
  selected?: boolean;
  defeated?: boolean;
  conditions?: string[];
  hp?: number;
  maxHp?: number;
  seed?: string;
  ancestryId?: string;
  classId?: string;
  role?: string;
  archetype?: string;
  sigil?: string;
  mainHand?: string;
  offHand?: string;
}

interface LocalActorRecord {
  key: string;
  view: ActorView;
  label: LabelEntry;
  markerId: string;
  kind: "npc" | "enemy" | "companion" | "party";
  hex: Hex;
  pixel: IsoPoint;
  target: IsoPoint;
  path: IsoPoint[] | null;
  pathIndex: number;
  lastHp?: number;
  defeated: boolean;
  appearanceKey: string;
  presentation: ActorPresentation;
}

export interface LocalRendererCallbacks {
  onSelect: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
}

export class LocalRenderer {
  private map: LocalMap;
  private partyHex: Hex;
  private readonly camera = new Container();
  private readonly backdrop = new Graphics();
  private readonly terrainLayer = new Container();
  private readonly decalLayer = new Container();
  private readonly gridLayer = new Graphics();
  private readonly overlayLayer = new Graphics();
  private readonly objectLayer = new Container();
  private readonly tintLayer = new Graphics();
  private readonly labels: IsoLabelLayer;
  private readonly water = new WaterAnimator();
  private readonly weather: WeatherFx;
  private readonly atmosphere = new AtmosphereFilter();
  private readonly callbacks: LocalRendererCallbacks;
  private weatherSetting: WeatherSetting;
  private graphicsQuality: GraphicsQuality;
  private readonly weatherSeed: string;
  private mapBounds: ReturnType<typeof mapIsoBounds>;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private readonly actors = new Map<string, LocalActorRecord>();
  private partyRecord: LocalActorRecord | null = null;
  private readonly windSprites: Sprite[] = [];
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
  private partyStatus: PartyActorStatus = {};
  private focusNpcId: string | null = null;
  private partyPathKey = "";
  private readonly partyAppearance: ActorAppearanceInput | undefined;
  private readonly tacticalGrid: boolean;
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
    weatherSetting: WeatherSetting = "auto",
    graphicsQuality: GraphicsQuality = "balanced",
    weatherSeed = "",
    partyAppearance?: ActorAppearanceInput,
    partyStatus?: PartyActorStatus,
    tacticalGrid = false,
  ) {
    this.tacticalGrid = tacticalGrid;
    this.map = map;
    this.partyHex = partyHex;
    this.hour = hour;
    this.partyActive = partyActive;
    this.partyStatus = { ...partyStatus, active: partyActive };
    this.reduceMotion = reduceMotion;
    this.weatherSetting = weatherSetting;
    this.graphicsQuality = graphicsQuality;
    this.weatherSeed = weatherSeed || map.id;
    this.partyAppearance = partyAppearance;
    this.mapBounds = mapIsoBounds(map, HEX_SIZE, 56);
    this.callbacks = callbacks;

    this.objectLayer.sortableChildren = true;
    this.app.stage.addChild(this.backdrop, this.camera);
    drawBackdrop(this.app, this.backdrop, map.kind === "dungeon" ? "dungeon" : "town", hour);
    this.camera.addChild(
      this.terrainLayer,
      this.decalLayer,
      this.gridLayer,
      this.overlayLayer,
      this.objectLayer,
      this.tintLayer,
    );
    this.weather = new WeatherFx(app, {
      setting: this.weatherSetting,
      quality: this.graphicsQuality,
      mapId: map.id,
      hour,
      seed: this.weatherSeed,
      indoor: map.kind === "dungeon",
      reduceMotion,
    });
    if (this.graphicsQuality !== "low") this.camera.filters = [this.atmosphere];
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
      this.updateActors(ticker.deltaMS);
      if (!this.reduceMotion && this.graphicsQuality !== "low") {
        for (const sprite of this.windSprites) {
          sprite.rotation = Math.sin(this.elapsed * 0.0011 + sprite.x * 0.031 + sprite.y * 0.013) * 0.02;
        }
      }
      this.water.update(this.elapsed, this.reduceMotion || this.graphicsQuality === "low");
      this.weather.update(ticker.deltaMS);
      this.atmosphere.setMood(
        this.elapsed / 1000,
        this.reduceMotion ? 0.12 : this.graphicsQuality === "high" ? 0.24 : 0.2,
        this.reduceMotion ? 0 : this.graphicsQuality === "high" ? 0.015 : 0.01,
      );
      this.labels.update(this.camera);
    };
    this.app.ticker.add(this.tick);
  }

  setHour(hour: number): void {
    this.hour = hour;
    drawBackdrop(this.app, this.backdrop, this.map.kind === "dungeon" ? "dungeon" : "town", hour);
    this.drawTint();
    this.weather.setWeather(
      this.weatherSetting,
      this.map.id,
      hour,
      this.weatherSeed,
      this.map.kind === "dungeon",
    );
  }

  setWeatherSetting(weatherSetting: WeatherSetting): void {
    this.weatherSetting = weatherSetting;
    this.weather.setWeather(
      weatherSetting,
      this.map.id,
      this.hour,
      this.weatherSeed,
      this.map.kind === "dungeon",
    );
  }

  setGraphicsQuality(graphicsQuality: GraphicsQuality): void {
    this.graphicsQuality = graphicsQuality;
    this.weather.setQuality(graphicsQuality);
    this.camera.filters = graphicsQuality === "low" ? [] : [this.atmosphere];
  }

  setPartyActive(active: boolean): void {
    if (this.partyActive === active) return;
    this.partyActive = active;
    this.partyStatus = { ...this.partyStatus, active };
    this.applyPartyPresentation();
  }

  setPartyStatus(status: PartyActorStatus): void {
    const previous = this.partyStatus;
    this.partyStatus = { ...status, active: this.partyActive || status.active };
    if (
      this.partyRecord &&
      status.hpRatio !== undefined &&
      previous.hpRatio !== undefined &&
      status.hpRatio < previous.hpRatio - 0.001
    ) {
      this.partyRecord.view.playCue("hurt");
    }
    if (this.partyRecord && status.defeated && !previous.defeated) {
      this.partyRecord.view.playCue("death");
    }
    this.applyPartyPresentation();
  }

  setFocusNpc(id: string | null): void {
    if (this.focusNpcId === id) return;
    this.focusNpcId = id;
    for (const record of this.actors.values()) {
      if (record.kind === "npc" || record.kind === "companion") {
        record.view.setPresentation(this.presentationFor(record, this.focusNpcId === record.markerId));
      }
    }
  }

  setReduceMotion(reduceMotion: boolean): void {
    this.reduceMotion = reduceMotion;
    this.weather.setReduceMotion(reduceMotion);
    if (reduceMotion) {
      for (const sprite of this.windSprites) sprite.rotation = 0;
    }
  }

  playCue(cue: ActorVisualCue): void {
    const actor = cue.actorId === "party" ? this.partyRecord : this.actors.get(this.keyFor(cue.actorId));
    if (!actor) return;
    const target =
      cue.targetId === "party"
        ? this.partyRecord
        : cue.targetId
          ? this.actors.get(this.keyFor(cue.targetId))
          : undefined;
    const facing = target
      ? facingToward(actor.pixel, target.pixel, actor.view.currentFacing)
      : actor.view.currentFacing;
    actor.view.playCue(cue.kind, facing);
    if (cue.damage && target) target.view.showDamage(cue.damage);
  }

  private clearLayer(layer: Container): void {
    for (const child of layer.removeChildren()) child.destroy({ children: true });
  }

  private buildStatic(): void {
    this.clearLayer(this.terrainLayer);
    this.clearLayer(this.decalLayer);
    this.clearLayer(this.objectLayer);
    this.windSprites.length = 0;
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
      .fill({
        color: this.map.kind === "dungeon" ? 0x070606 : 0x0f0e0b,
        alpha: 0.68,
      });
    this.terrainLayer.addChild(background);

    const topGroups = new Map<string, { tileId: string; variant: number; builder: MeshBuilder }>();
    const sideGroups = new Map<string, { tileId: string; variant: number; builder: MeshBuilder }>();
    const waterGroups = new Map<string, { variant: number; builder: MeshBuilder }>();
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const tileId = localTileAt(this.map, hex);
        const variant = tileVariant(this.map.id, hex, tileId);
        const z = tileHeight(tileId);
        if (tileId === "water") {
          const key = String(variant);
          let water = waterGroups.get(key);
          if (!water) {
            water = { variant, builder: new MeshBuilder() };
            waterGroups.set(key, water);
          }
          addHexTop(water.builder, hex, HEX_SIZE, z);
          continue;
        }
        const key = `${tileId}:${variant}`;
        let top = topGroups.get(key);
        if (!top) {
          top = { tileId, variant, builder: new MeshBuilder() };
          topGroups.set(key, top);
        }
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
    for (const group of waterGroups.values()) {
      const texture = animatedWaterTexture(getLocalTile("water").color, group.variant);
      this.water.register(texture, group.variant * 1.6);
      const mesh = meshFrom(group.builder, texture);
      if (mesh) {
        mesh.geometry.batchMode = "no-batch";
        this.terrainLayer.addChild(mesh);
      }
    }
    for (const group of sideGroups.values()) {
      const color = getLocalTile(group.tileId).color;
      const mesh = meshFrom(group.builder, terrainSideTexture(group.tileId, color, group.variant));
      if (mesh) this.terrainLayer.addChild(mesh);
    }
    this.terrainLayer.addChild(createShoreline(this.map, HEX_SIZE));

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
    this.drawTacticalGrid();
  }

  private drawTacticalGrid(): void {
    this.gridLayer.clear();
    if (!this.tacticalGrid) return;
    for (let row = 0; row < this.map.height; row += 1) {
      for (let col = 0; col < this.map.width; col += 1) {
        const hex = { q: col - Math.floor(row / 2), r: row };
        const z = tileHeight(localTileAt(this.map, hex)) + 0.012;
        const points = projectHexCorners(hex, HEX_SIZE, z, 0.4);
        this.gridLayer
          .poly(
            points.flatMap((point) => [point.x, point.y]),
            true,
          )
          .stroke({ color: 0x080706, width: 1.5, alpha: 0.32 })
          .stroke({ color: 0xe8c987, width: 1.05, alpha: 0.55 });
      }
    }
  }

  private drawRoads(): void {
    const shadow = new MeshBuilder();
    const road = new MeshBuilder();
    const water = new MeshBuilder();
    for (const segment of roadSegments(this.map)) {
      const from = projectHex(segment.from, HEX_SIZE, 0.04);
      const to = projectHex(segment.to, HEX_SIZE, 0.04);
      addOrganicRibbon(shadow, from, to, { width: 22, repeat: 1 });
      addOrganicRibbon(road, from, to, { width: 18, repeat: 1 });
    }
    for (const segment of waterSegments(this.map)) {
      addOrganicRibbon(
        water,
        projectHex(segment.from, HEX_SIZE, 0.02),
        projectHex(segment.to, HEX_SIZE, 0.02),
        { width: 25 },
      );
    }
    const shadowMesh = meshFrom(shadow, ribbonTexture("road", 0x3f3428));
    if (shadowMesh) {
      shadowMesh.alpha = 0.56;
      this.decalLayer.addChild(shadowMesh);
    }
    const roadMesh = meshFrom(road, ribbonTexture("road", getLocalTile("road").color));
    if (roadMesh) this.decalLayer.addChild(roadMesh);
    const waterTexture = animatedWaterTexture(getLocalTile("water").color, 1);
    this.water.register(waterTexture, 3.4);
    const waterMesh = meshFrom(water, waterTexture);
    if (waterMesh) {
      waterMesh.geometry.batchMode = "no-batch";
      waterMesh.alpha = 0.44;
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
            this.windSprites.push(sprite);
          }
        } else if (tileId === "brush" || tileId === "marsh") {
          const sprite = addProp(this.objectLayer, tileId === "marsh" ? "reeds" : "bush", base, {
            scale: tileId === "marsh" ? 0.3 : 0.26,
            variant: seed % 3,
          });
          sprite.zIndex = base.y;
          this.windSprites.push(sprite);
        } else if (tileId === "grass") {
          if (this.graphicsQuality !== "low") {
            if (seed % 2 === 0) {
              const sprite = addProp(
                this.objectLayer,
                "tuft",
                {
                  x: base.x + ((seed % 15) - 7) * 0.35,
                  y: base.y + ((Math.floor(seed / 9) % 7) - 3) * 0.3,
                },
                { scale: 0.2 + ((seed >> 4) % 12) / 100, variant: seed % 3 },
              );
              sprite.zIndex = base.y;
              this.windSprites.push(sprite);
            }
            if (seed % 9 === 0) {
              const flower = addProp(
                this.objectLayer,
                "flowers",
                { x: base.x + 3, y: base.y - 1 },
                { scale: 0.24, variant: seed % 3 },
              );
              flower.zIndex = base.y + 0.1;
              this.windSprites.push(flower);
            }
          }
        } else if (tileId === "field" || tileId === "crop") {
          if (this.graphicsQuality !== "low" && seed % 3 === 0) {
            const sprite = addProp(this.objectLayer, tileId === "crop" ? "wheat" : "tuft", base, {
              scale: 0.22 + (seed % 7) / 100,
              variant: seed % 3,
            });
            sprite.zIndex = base.y;
            this.windSprites.push(sprite);
          }
        } else if (tileId === "rock" || tileId === "cliff") {
          const sprite = addProp(this.objectLayer, "rock", base, {
            scale: tileId === "cliff" ? 0.72 : 0.56,
            variant: seed % 3,
          });
          sprite.zIndex = base.y;
          if (this.graphicsQuality !== "low" && tileId === "cliff" && seed % 8 === 0) {
            const mountain = addProp(this.objectLayer, "mountain", base, {
              scale: 0.5 + (seed % 10) / 100,
              variant: seed % 3,
            });
            mountain.zIndex = base.y + 0.2;
          }
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

  private keyFor(id: string): string {
    return `npc:${id}`;
  }

  private appearanceInputFor(marker: LocalNpcMarker): ActorAppearanceInput {
    return {
      id: marker.id,
      name: marker.name,
      palette: marker.palette,
      seed: marker.seed ?? marker.id,
      ancestryId: marker.ancestryId,
      classId: marker.classId,
      role: marker.role,
      archetype: marker.archetype,
      sigil: marker.sigil,
      mainHand: marker.mainHand,
      offHand: marker.offHand,
      enemyId: marker.kind === "enemy" ? marker.id : undefined,
    };
  }

  private appearanceKeyFor(marker: LocalNpcMarker): string {
    return [
      marker.palette,
      marker.seed,
      marker.ancestryId,
      marker.classId,
      marker.role,
      marker.archetype,
      marker.sigil,
      marker.mainHand,
      marker.offHand,
      marker.kind,
    ].join("|");
  }

  private createRecord(
    markerId: string,
    kind: LocalActorRecord["kind"],
    name: string,
    point: IsoPoint,
    appearanceKey: string,
    appearance: ActorAppearanceInput,
  ): LocalActorRecord {
    const view = new ActorView(appearance, "s");
    view.setPosition(point.x, point.y);
    const label = makeLabel(name, {
      color: kind === "enemy" ? 0xe0b0aa : 0xf0e7d2,
      size: kind === "party" ? 8 : 8,
    });
    const stagger = kind === "party" ? 0 : (hashString(markerId) % 3) * 4;
    const entry = this.labels.add(label, point, {
      anchorY: 1,
      offsetY: view.labelOffsetY - 5 - stagger,
      minZoom: LABEL_ZOOM,
    });
    view.container.zIndex = point.y;
    this.objectLayer.addChild(view.container);
    return {
      key: this.keyFor(markerId),
      view,
      label: entry,
      markerId,
      kind,
      hex: { q: 0, r: 0 },
      pixel: { ...point },
      target: { ...point },
      path: null,
      pathIndex: 0,
      defeated: false,
      appearanceKey,
      presentation: {},
    };
  }

  private removeRecord(record: LocalActorRecord): void {
    this.objectLayer.removeChild(record.view.container);
    record.view.destroy();
    this.labels.remove(record.label);
    this.actors.delete(record.key);
  }

  private clearActors(): void {
    for (const record of this.actors.values()) this.removeRecord(record);
    if (this.partyRecord) {
      this.objectLayer.removeChild(this.partyRecord.view.container);
      this.partyRecord.view.destroy();
      this.labels.remove(this.partyRecord.label);
      this.partyRecord = null;
    }
    this.actors.clear();
    this.partyPathKey = "";
  }

  private presentationFor(record: LocalActorRecord, talking = false): ActorPresentation {
    return {
      ...record.presentation,
      talking,
      defeated: record.defeated,
    };
  }

  private applyPartyPresentation(): void {
    if (!this.partyRecord) return;
    this.partyRecord.presentation = {
      active: this.partyStatus.active ?? this.partyActive,
      defeated: this.partyStatus.defeated ?? false,
      conditions: this.partyStatus.conditions ?? [],
      team: "friendly",
    };
    this.partyRecord.defeated = this.partyStatus.defeated ?? false;
    this.partyRecord.view.setPresentation(this.partyRecord.presentation);
  }

  private syncParty(hasPath: boolean): void {
    const point = projectHex(this.partyHex, HEX_SIZE, tileHeight(localTileAt(this.map, this.partyHex)));
    const appearance = this.partyAppearance ?? {
      id: "party",
      name: "You",
      palette: "gold",
      seed: "party",
    };
    if (!this.partyRecord) {
      const record = this.createRecord("party", "party", "You", point, "party", appearance);
      record.presentation = {
        active: this.partyActive,
        defeated: this.partyStatus.defeated ?? false,
        conditions: this.partyStatus.conditions ?? [],
        team: "friendly",
      };
      record.view.setPresentation(record.presentation);
      this.partyRecord = record;
    }
    const record = this.partyRecord;
    record.target = point;
    record.hex = this.partyHex;
    const distance = Math.hypot(record.target.x - record.pixel.x, record.target.y - record.pixel.y);
    if (distance > 220 && !hasPath) {
      record.pixel = { ...point };
      record.path = null;
    }
    this.applyPartyPresentation();
  }

  private syncMarker(marker: LocalNpcMarker): void {
    const key = this.keyFor(marker.id);
    const appearanceKey = this.appearanceKeyFor(marker);
    const existing = this.actors.get(key);
    if (existing && existing.appearanceKey !== appearanceKey) {
      this.removeRecord(existing);
    }
    const point = projectHex(marker.hex, HEX_SIZE, tileHeight(localTileAt(this.map, marker.hex)));
    let record = this.actors.get(key);
    if (!record) {
      record = this.createRecord(
        marker.id,
        marker.kind ?? "npc",
        marker.name,
        point,
        appearanceKey,
        this.appearanceInputFor(marker),
      );
      this.actors.set(key, record);
    }
    record.hex = marker.hex;
    record.target = point;
    if (Math.hypot(point.x - record.pixel.x, point.y - record.pixel.y) > 190) {
      record.pixel = { ...point };
      record.path = null;
    }
    const defeated = marker.defeated ?? false;
    if (marker.hp !== undefined && record.lastHp !== undefined && marker.hp < record.lastHp) {
      record.view.playCue("hurt", facingToward(record.pixel, this.partyPixel(), record.view.currentFacing));
    }
    if (defeated && !record.defeated) {
      record.view.playCue("death");
      record.path = null;
    }
    record.lastHp = marker.hp;
    record.defeated = defeated;
    record.presentation = {
      active: marker.active ?? false,
      selected: marker.selected ?? false,
      conditions: marker.conditions ?? [],
      hpRatio: marker.hp !== undefined && marker.maxHp ? marker.hp / marker.maxHp : undefined,
      team: marker.kind === "enemy" ? "enemy" : "friendly",
      defeated,
      talking: this.focusNpcId === marker.id,
    };
    record.view.setPresentation(record.presentation);
  }

  private partyPixel(): IsoPoint {
    if (this.partyRecord) return this.partyRecord.pixel;
    return projectHex(this.partyHex, HEX_SIZE, tileHeight(localTileAt(this.map, this.partyHex)));
  }

  private updateActors(deltaMS: number): void {
    const dt = Math.min(deltaMS, 50) / 1000;
    const partyPixel = this.partyPixel();
    for (const record of this.actors.values()) {
      let target = record.target;
      if (record.path && record.pathIndex < record.path.length) {
        target = record.path[record.pathIndex] ?? target;
      }
      const dx = target.x - record.pixel.x;
      const dy = target.y - record.pixel.y;
      const distance = Math.hypot(dx, dy);
      let moving = false;
      let speed = 0;
      if (distance > 0.55) {
        const maxStep = (record.kind === "party" ? 215 : 165) * dt;
        const step = Math.min(distance, maxStep);
        record.pixel = {
          x: record.pixel.x + (dx / distance) * step,
          y: record.pixel.y + (dy / distance) * step,
        };
        moving = step > 0.05;
        speed = dt > 0 ? Math.min(300, (step / dt) * 1000) : 0;
        if (record.path && distance <= maxStep + 0.6) {
          record.pathIndex += 1;
          if (record.pathIndex >= record.path.length) record.path = null;
        }
      } else if (record.path) {
        record.pathIndex += 1;
        if (record.pathIndex >= record.path.length) record.path = null;
      }

      if (moving) {
        record.view.setFacing(facingFromVector(dx, dy, record.view.currentFacing));
      } else if (record.kind !== "party" && !record.defeated) {
        const towardPlayer = Math.hypot(partyPixel.x - record.pixel.x, partyPixel.y - record.pixel.y);
        if (towardPlayer < HEX_SIZE * 3.2) {
          record.view.setFacing(facingToward(record.pixel, partyPixel, record.view.currentFacing));
        }
      }
      record.view.setMotion(speed, record.view.currentFacing);
      record.view.setPosition(record.pixel.x, record.pixel.y);
      record.view.container.zIndex = record.pixel.y;
      this.labels.setPoint(record.label, record.pixel);
      record.view.update(deltaMS, this.reduceMotion, this.graphicsQuality);
    }
    if (this.partyRecord) {
      this.labels.setPoint(this.partyRecord.label, this.partyRecord.pixel);
    }
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
    let focusHex = this.partyHex;
    if (this.tacticalGrid && this.actors.size > 0) {
      const combatants = [this.partyHex, ...[...this.actors.values()].map((record) => record.hex)];
      focusHex = {
        q: Math.round(combatants.reduce((sum, hex) => sum + hex.q, 0) / combatants.length),
        r: Math.round(combatants.reduce((sum, hex) => sum + hex.r, 0) / combatants.length),
      };
    }
    const focus = projectHex(focusHex, HEX_SIZE, tileHeight(localTileAt(this.map, focusHex)));
    const initialScale = fitIsoCamera(this.app, this.camera, this.mapBounds, focus, {
      padding: this.tacticalGrid ? 18 : 28,
      minScale: this.tacticalGrid ? 0.9 : 0.55,
      maxScale: this.tacticalGrid ? 1.45 : 2.45,
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

  update(map: LocalMap, partyHex: Hex, npcs: LocalNpcMarker[], partyPath?: Hex[]): void {
    if (map.id !== this.map.id) {
      this.clearActors();
      this.labels.clear();
      this.water.clear();
      this.partyPathKey = "";
      this.map = map;
      this.mapBounds = mapIsoBounds(map, HEX_SIZE, 56);
      this.weather.setWeather(
        this.weatherSetting,
        map.id,
        this.hour,
        this.weatherSeed,
        map.kind === "dungeon",
      );
      this.buildStatic();
      this.fitToScreen();
    }
    this.partyHex = partyHex;
    const seen = new Set<string>();
    for (const npc of npcs) {
      seen.add(this.keyFor(npc.id));
      this.syncMarker(npc);
    }
    for (const [key, record] of this.actors) {
      if (!seen.has(key)) this.removeRecord(record);
    }
    this.syncParty(Boolean(partyPath && partyPath.length > 0));
    if (partyPath && partyPath.length > 0 && this.partyRecord) {
      const pathKey = partyPath.map((hex) => `${hex.q},${hex.r}`).join("|");
      if (pathKey !== this.partyPathKey) {
        this.partyPathKey = pathKey;
        this.partyRecord.path = partyPath.map((hex) =>
          projectHex(hex, HEX_SIZE, tileHeight(localTileAt(this.map, hex))),
        );
        this.partyRecord.pathIndex = 0;
      }
    } else if (this.partyPathKey) {
      this.partyPathKey = "";
      if (this.partyRecord) {
        this.partyRecord.path = null;
        this.partyRecord.pathIndex = 0;
      }
    }
    this.drawHover();
    this.labels.update(this.camera);
  }

  handleResize(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    drawBackdrop(this.app, this.backdrop, this.map.kind === "dungeon" ? "dungeon" : "town", this.hour);
    this.weather.resize();
    this.labels.update(this.camera);
  }

  destroy(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.app.canvas.removeEventListener("wheel", this.wheelHandler);
    this.clearActors();
    this.water.clear();
    this.weather.destroy();
    this.atmosphere.destroy();
    this.labels.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
