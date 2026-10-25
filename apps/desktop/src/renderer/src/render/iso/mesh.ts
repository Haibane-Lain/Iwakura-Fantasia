import type { Hex } from "@iwakura/contracts";
import { cornerOffset, hexToPixel } from "@iwakura/engine";
import { Mesh, MeshGeometry, type Texture } from "pixi.js";
import { ISO_HEIGHT, type IsoPoint, projectHexCorners, projectPoint } from "./projection";

export interface UvPoint {
  readonly u: number;
  readonly v: number;
}

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  get empty(): boolean {
    return this.indices.length === 0;
  }

  addTriangle(a: IsoPoint, b: IsoPoint, c: IsoPoint, uvA: UvPoint, uvB: UvPoint, uvC: UvPoint): void {
    const base = this.positions.length / 2;
    this.positions.push(a.x, a.y, b.x, b.y, c.x, c.y);
    this.uvs.push(uvA.u, uvA.v, uvB.u, uvB.v, uvC.u, uvC.v);
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(
    a: IsoPoint,
    b: IsoPoint,
    c: IsoPoint,
    d: IsoPoint,
    uvA: UvPoint,
    uvB: UvPoint,
    uvC: UvPoint,
    uvD: UvPoint,
  ): void {
    const base = this.positions.length / 2;
    this.positions.push(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
    this.uvs.push(uvA.u, uvA.v, uvB.u, uvB.v, uvC.u, uvC.v, uvD.u, uvD.v);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): MeshGeometry {
    return new MeshGeometry({
      positions: new Float32Array(this.positions),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    });
  }
}

export function meshFrom(builder: MeshBuilder, texture: Texture): Mesh | null {
  if (builder.empty) return null;
  return new Mesh({ geometry: builder.build(), texture });
}

function cornerUv(corner: number, size: number): UvPoint {
  const offset = cornerOffset(corner, size);
  return {
    u: 0.5 + offset.x / (size * 2),
    v: 0.5 + offset.y / (size * 2),
  };
}

/**
 * Add a hex top surface at the given world height. `inset` pulls the top face
 * inwards a fraction of a world unit to avoid hairline seams between tiles.
 */
export function addHexTop(builder: MeshBuilder, hex: Hex, size: number, z: number, inset = 0.5): void {
  const points = projectHexCorners(hex, size, z, inset);
  const centerWorld = hexToPixel(hex, size);
  const center = projectPoint(centerWorld, z);
  const centerUv: UvPoint = { u: 0.5, v: 0.5 };
  for (let corner = 0; corner < 6; corner += 1) {
    const next = (corner + 1) % 6;
    builder.addTriangle(
      center,
      points[corner]!,
      points[next]!,
      centerUv,
      cornerUv(corner, size),
      cornerUv(next, size),
    );
  }
}

/** Add a flat top-down hex surface for the strategic atlas. */
export function addFlatHexTop(builder: MeshBuilder, hex: Hex, size: number, inset = 0.4): void {
  const center = hexToPixel(hex, size);
  const points: IsoPoint[] = [];
  for (let corner = 0; corner < 6; corner += 1) {
    const offset = cornerOffset(corner, size - inset);
    points.push({ x: center.x + offset.x, y: center.y + offset.y });
  }
  const centerUv: UvPoint = { u: 0.5, v: 0.5 };
  for (let corner = 0; corner < 6; corner += 1) {
    const next = (corner + 1) % 6;
    builder.addTriangle(
      center,
      points[corner]!,
      points[next]!,
      centerUv,
      cornerUv(corner, size),
      cornerUv(next, size),
    );
  }
}

/** Add the visible vertical skirt under a raised hex top. */
export function addHexSides(builder: MeshBuilder, hex: Hex, size: number, z: number, inset = 0.5): void {
  if (z <= 0) return;
  const top = projectHexCorners(hex, size, z, inset);
  const bottom = projectHexCorners(hex, size, 0, inset);
  const height = z * ISO_HEIGHT;
  for (let corner = 0; corner < 6; corner += 1) {
    const next = (corner + 1) % 6;
    const uvHeight = Math.max(0.18, height / 70);
    builder.addQuad(
      top[corner]!,
      top[next]!,
      bottom[next]!,
      bottom[corner]!,
      { u: 0.08, v: 0 },
      { u: 0.92, v: 0 },
      { u: 0.92, v: uvHeight },
      { u: 0.08, v: uvHeight },
    );
  }
}

export interface RibbonOptions {
  width: number;
  /** Number of texture repeats along the ribbon. */
  repeat?: number;
  offset?: number;
}

/** Add a textured ribbon between two projected points. */
export function addRibbon(builder: MeshBuilder, from: IsoPoint, to: IsoPoint, options: RibbonOptions): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return;
  const nx = (-dy / length) * (options.width / 2);
  const ny = (dx / length) * (options.width / 2);
  const repeat = options.repeat ?? Math.max(1, length / 46);
  const offset = options.offset ?? 0;
  builder.addQuad(
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
    { u: 0, v: offset },
    { u: 0, v: offset + repeat },
    { u: 1, v: offset + repeat },
    { u: 1, v: offset },
  );
}

export interface BuildingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  baseZ: number;
  wallHeight: number;
  roofHeight: number;
  ridgeAlongX: boolean;
}

export interface BuildingGeometry {
  walls: MeshBuilder;
  roof: MeshBuilder;
}

function rectCorners(
  box: BuildingBox,
  z: number,
): {
  northWest: IsoPoint;
  northEast: IsoPoint;
  southEast: IsoPoint;
  southWest: IsoPoint;
} {
  return {
    northWest: projectPoint({ x: box.minX, y: box.minY }, z),
    northEast: projectPoint({ x: box.maxX, y: box.minY }, z),
    southEast: projectPoint({ x: box.maxX, y: box.maxY }, z),
    southWest: projectPoint({ x: box.minX, y: box.maxY }, z),
  };
}

/**
 * Build the two camera-facing walls and a simple gable roof for a rectangular
 * building footprint. World +X and +Y are the visible faces in this projection.
 */
export function addBuilding(box: BuildingBox): BuildingGeometry {
  const walls = new MeshBuilder();
  const roof = new MeshBuilder();
  const baseZ = box.baseZ;
  const wallTop = baseZ + box.wallHeight;
  const roofTop = wallTop + box.roofHeight;

  const base = rectCorners({ ...box, baseZ }, baseZ);
  const top = rectCorners({ ...box, baseZ }, wallTop);

  // +X wall (screen right).
  walls.addQuad(
    top.northEast,
    top.southEast,
    base.southEast,
    base.northEast,
    { u: 0.02, v: 0 },
    { u: 0.98, v: 0 },
    { u: 0.98, v: 1 },
    { u: 0.02, v: 1 },
  );
  // +Y wall (screen left).
  walls.addQuad(
    top.southEast,
    top.southWest,
    base.southWest,
    base.southEast,
    { u: 0.06, v: 0 },
    { u: 0.94, v: 0 },
    { u: 0.94, v: 1 },
    { u: 0.06, v: 1 },
  );

  const midX = (box.minX + box.maxX) / 2;
  const midY = (box.minY + box.maxY) / 2;
  const eaveNorthEast = top.northEast;
  const eaveSouthEast = top.southEast;
  const eaveSouthWest = top.southWest;
  const eaveNorthWest = top.northWest;

  if (box.ridgeAlongX) {
    const ridgeWest = projectPoint({ x: box.minX, y: midY }, roofTop);
    const ridgeEast = projectPoint({ x: box.maxX, y: midY }, roofTop);

    // North slope is farther from the camera, draw it first.
    roof.addQuad(
      eaveNorthWest,
      eaveNorthEast,
      ridgeEast,
      ridgeWest,
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
    );
    roof.addQuad(
      eaveSouthWest,
      eaveSouthEast,
      ridgeEast,
      ridgeWest,
      { u: 0, v: 1 },
      { u: 1, v: 1 },
      { u: 1, v: 0 },
      { u: 0, v: 0 },
    );

    // East gable end.
    walls.addTriangle(
      eaveSouthEast,
      eaveNorthEast,
      ridgeEast,
      { u: 0.1, v: 0.6 },
      { u: 0.9, v: 0.6 },
      { u: 0.5, v: 0.05 },
    );
  } else {
    const ridgeNorth = projectPoint({ x: midX, y: box.minY }, roofTop);
    const ridgeSouth = projectPoint({ x: midX, y: box.maxY }, roofTop);

    roof.addQuad(
      eaveNorthWest,
      ridgeNorth,
      ridgeSouth,
      eaveSouthWest,
      { u: 0, v: 0 },
      { u: 0.5, v: 0 },
      { u: 0.5, v: 1 },
      { u: 0, v: 1 },
    );
    roof.addQuad(
      eaveNorthEast,
      ridgeNorth,
      ridgeSouth,
      eaveSouthEast,
      { u: 1, v: 0 },
      { u: 0.5, v: 0 },
      { u: 0.5, v: 1 },
      { u: 1, v: 1 },
    );

    // South gable end.
    walls.addTriangle(
      eaveSouthWest,
      eaveSouthEast,
      ridgeSouth,
      { u: 0.1, v: 0.6 },
      { u: 0.9, v: 0.6 },
      { u: 0.5, v: 0.05 },
    );
  }

  return { walls, roof };
}
