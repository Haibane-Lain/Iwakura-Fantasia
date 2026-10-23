import { getHandcraftedWorldPack, getTerrain, isWaterTerrain, TERRAINS } from "@iwakura/content";
import type {
  HandcraftedWorldPack,
  Hex,
  PointOfInterest,
  WorldGenParams,
  WorldGenRequest,
  WorldGenResult,
  WorldIssue,
  WorldReport,
  WorldState,
} from "@iwakura/contracts";
import { WorldGenParamsSchema } from "@iwakura/contracts";
import { axialIndex, axialToOffset, inBounds, offsetFromIndex, offsetToAxial } from "./grid.js";
import { add, distance, findPath, hex, hexKey, neighbors, spiral } from "./hex.js";
import { clamp01, fbm, ridged, smoothstep } from "./noise.js";
import { createRng, hashString, type Rng } from "./rng.js";

const TOWN_NAMES = [
  "Redford",
  "Ashcross",
  "Dunmoor",
  "Greyharbor",
  "Kestrel",
  "Lowmere",
  "Marrow",
  "Oakvale",
  "Palebrook",
  "Stonebridge",
  "Thornwick",
  "Whitefall",
];

const VILLAGE_NAMES = [
  "Millbrook",
  "Barley",
  "Cinder",
  "Dun",
  "Elm",
  "Fen",
  "Harrow",
  "Kell",
  "Moss",
  "Reed",
  "Stile",
  "Wren",
];

const DUNGEON_NAMES = [
  "The Old Mill Crypt",
  "Barrow of the Silver King",
  "Cinderfall Mine",
  "The Drowned Vault",
  "Hollowwatch",
  "The Weeping Stair",
  "Greywatch Undercroft",
  "The Rootbound Hall",
];

const SHRINE_NAMES = [
  "Shrine of the Quiet Ford",
  "The Stone Lantern",
  "Chapel of the Last Mile",
  "The Traveller's Vow",
  "Spring of the Pale Saint",
];

const RUIN_NAMES = [
  "Greywatch Ruin",
  "The Broken Watch",
  "Old Kestrel Tower",
  "The Fallen Gate",
  "Marrow Keep",
];

const WORLD_PREFIXES = ["Ashen", "Verdant", "Grey", "Sunken", "Whispering", "Golden", "Broken", "Old"];
const WORLD_SUFFIXES = ["Reach", "Marches", "Vale", "Coast", "Expanse", "Downs", "Wilds", "Borders"];

interface MutableWorld {
  width: number;
  height: number;
  terrain: string[];
  elevation: number[];
  moisture: number[];
  temperature: number[];
  river: number[];
  road: number[];
  pois: PointOfInterest[];
}

function cellIndex(width: number, offset: { col: number; row: number }): number {
  return offset.row * width + offset.col;
}

function offsetNeighbors(
  width: number,
  height: number,
  index: number,
): Array<{ index: number; offset: { col: number; row: number }; hex: Hex }> {
  const offset = offsetFromIndex(width, index);
  const center = offsetToAxial(offset);
  return neighbors(center)
    .map((h) => {
      const o = axialToOffset(h);
      return { index: inBounds(width, height, o) ? cellIndex(width, o) : -1, offset: o, hex: h };
    })
    .filter((entry) => entry.index >= 0);
}

function waterDistance(world: MutableWorld): Int32Array {
  const total = world.width * world.height;
  const dist = new Int32Array(total).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (isWaterTerrain(world.terrain[i]!) || world.river[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++]!;
    const current = dist[index]!;
    for (const neighbor of offsetNeighbors(world.width, world.height, index)) {
      if (dist[neighbor.index] !== -1) continue;
      dist[neighbor.index] = current + 1;
      queue.push(neighbor.index);
    }
  }
  return dist;
}

function classifyBaseTerrain(world: MutableWorld, seaLevel: number): void {
  const { width, height, elevation, temperature, moisture } = world;
  for (let i = 0; i < width * height; i += 1) {
    const e = elevation[i]!;
    if (e < seaLevel) {
      world.terrain[i] = "ocean";
      continue;
    }
    const temp = temperature[i]!;
    const wet = moisture[i]!;
    if (e > 0.82) world.terrain[i] = "mountains";
    else if (e > 0.68) world.terrain[i] = "hills";
    else if (temp < 0.18) world.terrain[i] = "snow";
    else if (temp < 0.3) world.terrain[i] = "tundra";
    else if (wet > 0.72 && e < 0.56) world.terrain[i] = "swamp";
    else if (wet < 0.28 && temp > 0.55) world.terrain[i] = "desert";
    else if (wet > 0.55) world.terrain[i] = "forest";
    else world.terrain[i] = "grassland";
  }
}

function addCoastAndBeaches(world: MutableWorld, seaLevel: number): void {
  const { width, height } = world;
  const original = [...world.terrain];
  for (let index = 0; index < width * height; index += 1) {
    if (original[index] !== "ocean") continue;
    const touchesLand = offsetNeighbors(width, height, index).some(
      (neighbor) => !isWaterTerrain(original[neighbor.index]!),
    );
    if (touchesLand) world.terrain[index] = "coast";
  }
  for (let index = 0; index < width * height; index += 1) {
    if (isWaterTerrain(original[index]!)) continue;
    if (world.elevation[index]! > seaLevel + 0.06) continue;
    const touchesWater = offsetNeighbors(width, height, index).some((neighbor) =>
      isWaterTerrain(original[neighbor.index]!),
    );
    if (touchesWater && world.terrain[index] !== "mountains") {
      world.terrain[index] = "beach";
    }
  }
}

function traceRivers(world: MutableWorld, rng: Rng): void {
  const { width, height, elevation, terrain } = world;
  const total = width * height;
  const sources: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (!isWaterTerrain(terrain[i]!) && elevation[i]! > 0.58) sources.push(i);
  }
  const target = Math.max(1, Math.min(9, Math.floor(sources.length / 180) + 1));
  const chosen: number[] = [];
  for (const candidate of rng.shuffle(sources)) {
    if (chosen.length >= target) break;
    const offset = offsetFromIndex(width, candidate);
    const candidateHex = offsetToAxial(offset);
    if (
      chosen.some((existing) => distance(candidateHex, offsetToAxial(offsetFromIndex(width, existing))) < 5)
    ) {
      continue;
    }
    chosen.push(candidate);
  }

  for (const source of chosen) {
    let current = source;
    const visited = new Set<number>();
    for (let step = 0; step < 120; step += 1) {
      if (visited.has(current)) break;
      visited.add(current);
      if (isWaterTerrain(world.terrain[current]!)) break;
      world.river[current] = 1;

      const options = offsetNeighbors(width, height, current)
        .filter((neighbor) => !visited.has(neighbor.index))
        .map((neighbor) => ({
          index: neighbor.index,
          elevation: world.elevation[neighbor.index]!,
          water: isWaterTerrain(world.terrain[neighbor.index]!),
        }))
        .sort((a, b) => a.elevation - b.elevation);

      const next = options[0];
      if (!next) break;
      if (next.water) break;
      if (next.elevation >= world.elevation[current]! - 0.001) {
        // Local minimum: a small lake is more plausible than an uphill river.
        if (!isWaterTerrain(world.terrain[current]!)) world.terrain[current] = "lake";
        break;
      }
      current = next.index;
    }
  }
}

function recomputeMoisture(world: MutableWorld): void {
  const dist = waterDistance(world);
  for (let i = 0; i < world.moisture.length; i += 1) {
    const d = dist[i]!;
    if (d < 0) continue;
    world.moisture[i] = clamp01(world.moisture[i]! + 0.3 * Math.exp(-d / 4) + 0.05);
  }
}

function scoreSettlement(world: MutableWorld, index: number, rng: Rng, waterDist: Int32Array): number {
  const terrain = world.terrain[index]!;
  if (isWaterTerrain(terrain) || terrain === "mountains" || terrain === "snow") return -100;
  if (waterDist[index]! > 3) return -50;

  let score = 0;
  const offset = offsetFromIndex(world.width, index);
  const center = offsetToAxial(offset);
  let arable = 0;
  let hills = 0;
  for (const h of spiral(center, 4)) {
    const o = axialToOffset(h);
    if (!inBounds(world.width, world.height, o)) continue;
    const t = world.terrain[cellIndex(world.width, o)]!;
    if (t === "grassland" || t === "forest" || t === "steppe") arable += 1;
    if (t === "hills") hills += 1;
  }
  score += Math.min(3, arable / 10);
  score += Math.min(1.5, hills / 4);
  if (terrain === "grassland") score += 1;
  if (terrain === "forest") score += 0.4;
  if (terrain === "swamp" || terrain === "desert") score -= 1.5;
  if (world.river[index]) score -= 1.5;
  if (waterDist[index]! <= 1) score += 1.5;
  score += rng.next() * 0.7;
  return score;
}

interface SettlementCandidate {
  index: number;
  hex: Hex;
  score: number;
}

function pickSettlements(
  world: MutableWorld,
  rng: Rng,
  count: number,
  spacing: number,
  waterDist: Int32Array,
  towns: SettlementCandidate[],
  requireNearTown: boolean,
): SettlementCandidate[] {
  const candidates: SettlementCandidate[] = [];
  for (let i = 0; i < world.width * world.height; i += 1) {
    const score = scoreSettlement(world, i, rng, waterDist);
    if (score > 0) candidates.push({ index: i, hex: offsetToAxial(offsetFromIndex(world.width, i)), score });
  }
  candidates.sort((a, b) => b.score - a.score);

  const picked: SettlementCandidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    if (picked.some((existing) => distance(existing.hex, candidate.hex) < spacing)) continue;
    if (towns.some((town) => distance(town.hex, candidate.hex) < spacing)) continue;
    if (requireNearTown && towns.length > 0) {
      const nearest = Math.min(...towns.map((town) => distance(town.hex, candidate.hex)));
      if (nearest > 13) continue;
    }
    picked.push(candidate);
  }
  return picked;
}

function buildRoads(world: MutableWorld): { connected: boolean; unreachable: number } {
  const settlements = world.pois.filter((poi) => poi.kind === "town" || poi.kind === "village");
  if (settlements.length < 2) return { connected: true, unreachable: 0 };

  const cost = (h: Hex): number | null => {
    const index = axialIndex(world.width, world.height, h);
    if (index < 0) return null;
    const terrain = getTerrain(world.terrain[index]!);
    if (terrain.water || terrain.movementCost === null) return null;
    let value = terrain.movementCost;
    if (world.river[index]) value += 4;
    if (terrain.id === "mountains") value += 2;
    return value;
  };

  const paths = new Map<string, Hex[] | null>();
  for (let i = 0; i < settlements.length; i += 1) {
    for (let j = i + 1; j < settlements.length; j += 1) {
      const a = settlements[i]!;
      const b = settlements[j]!;
      const result = findPath(a.hex, b.hex, cost, 120_000);
      paths.set(`${i}:${j}`, result?.path ?? null);
    }
  }

  const inTree = new Set<number>([0]);
  let unreachable = 0;
  while (inTree.size < settlements.length) {
    let best: { from: number; to: number; path: Hex[]; cost: number } | null = null;
    for (const from of inTree) {
      for (let to = 0; to < settlements.length; to += 1) {
        if (inTree.has(to)) continue;
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        const path = paths.get(key);
        if (!path) continue;
        const total = path.reduce((sum, h) => sum + (cost(h) ?? 0), 0);
        if (!best || total < best.cost) best = { from, to, path, cost: total };
      }
    }
    if (!best) {
      unreachable = settlements.length - inTree.size;
      break;
    }
    for (const h of best.path) {
      const index = axialIndex(world.width, world.height, h);
      if (index >= 0 && !isWaterTerrain(world.terrain[index]!)) world.road[index] = 1;
    }
    inTree.add(best.to);
  }
  return { connected: unreachable === 0, unreachable };
}

function pushPoi(
  world: MutableWorld,
  poi: Omit<PointOfInterest, "hex"> & { offset: { col: number; row: number } },
): void {
  const { offset, ...rest } = poi;
  world.pois.push({ ...rest, hex: offsetToAxial(offset) });
}

function generateProcedural(params: WorldGenParams, seed: string): MutableWorld {
  const width = params.width;
  const height = params.height;
  const total = width * height;
  const rng = createRng(`worldgen:${seed}`);
  const seedNum = hashString(seed);

  const elevation = new Array<number>(total);
  const moisture = new Array<number>(total);
  const temperature = new Array<number>(total);
  const terrain = new Array<string>(total).fill("ocean");
  const river = new Array<number>(total).fill(0);
  const road = new Array<number>(total).fill(0);
  const pois: PointOfInterest[] = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      const nx = (col / (width - 1)) * 2 - 1;
      const ny = (row / (height - 1)) * 2 - 1;
      const d = Math.sqrt(nx * nx * 1.02 + ny * ny * 1.1);
      const continental = 1 - smoothstep(0.25, 1.05, d);
      const base = fbm(col * 0.045, row * 0.045, seedNum, 5);
      const detail = fbm(col * 0.13, row * 0.13, seedNum + 17, 3);
      const ridge = ridged(col * 0.055, row * 0.055, seedNum + 43, 4);
      const e = clamp01(
        0.12 + base * 0.55 + continental * 0.3 - 0.18 * d + detail * 0.05 + ridge * continental * 0.18,
      );
      elevation[index] = e;

      const latitude = Math.abs((row / (height - 1)) * 2 - 1);
      let temp = 1 - latitude * 0.75;
      if (params.climate === "cold") temp -= 0.18;
      if (params.climate === "warm") temp += 0.12;
      temp += (fbm(col * 0.08 + 40, row * 0.08, seedNum + 71, 3) - 0.5) * 0.12;
      temp -= Math.max(0, e - 0.55) * 0.35;
      temperature[index] = clamp01(temp);

      moisture[index] = clamp01(fbm(col * 0.06 + 100, row * 0.06, seedNum + 91, 4));
    }
  }

  const world: MutableWorld = {
    width,
    height,
    terrain,
    elevation,
    moisture,
    temperature,
    river,
    road,
    pois,
  };

  classifyBaseTerrain(world, params.seaLevel);
  addCoastAndBeaches(world, params.seaLevel);
  traceRivers(world, rng);
  recomputeMoisture(world);
  addCoastAndBeaches(world, params.seaLevel);

  const waterDist = waterDistance(world);
  const landTiles = world.terrain.filter((t) => !isWaterTerrain(t)).length;
  const density = params.settlementDensity;
  const townTarget = Math.max(1, Math.min(10, Math.round((landTiles / 700) * (0.45 + density))));
  const towns = pickSettlements(world, rng, townTarget, 6, waterDist, [], false);
  const villages = pickSettlements(
    world,
    rng,
    Math.max(1, Math.round(towns.length * (0.8 + density))),
    3,
    waterDist,
    towns,
    true,
  );

  const townNames = rng.shuffle(TOWN_NAMES);
  const villageNames = rng.shuffle(VILLAGE_NAMES);
  const settlementCandidates = [
    ...towns.map((town, index) => ({
      ...town,
      kind: "town" as const,
      name: townNames[index % townNames.length]!,
      size: index === 0 ? ("town" as const) : ("village" as const),
      description: "A market settlement with a well, a gate, and at least one guarded secret.",
    })),
    ...villages.map((village, index) => ({
      ...village,
      kind: "village" as const,
      name: villageNames[index % villageNames.length]!,
      size: "village" as const,
      description: "A small settlement of farmers, hunters, and people who know the weather.",
    })),
  ];

  for (let i = 0; i < settlementCandidates.length; i += 1) {
    const candidate = settlementCandidates[i]!;
    const offset = offsetFromIndex(width, candidate.index);
    pushPoi(world, {
      id: `poi_${i}_${candidate.kind}`,
      kind: candidate.kind,
      name: candidate.name,
      offset,
      discovered: false,
      description: candidate.description,
      size: candidate.size,
      levelBand: { min: 1, max: 3 },
    });
  }

  const dungeonCount = Math.max(1, Math.min(6, Math.round(towns.length * 0.8)));
  const dungeonCandidates: Array<{ index: number; hex: Hex; score: number }> = [];
  for (let i = 0; i < total; i += 1) {
    const t = world.terrain[i]!;
    if (t !== "hills" && t !== "mountains") continue;
    const hex = offsetToAxial(offsetFromIndex(width, i));
    const nearestTown = Math.min(
      ...settlementCandidates
        .filter((settlement) => settlement.kind === "town")
        .map((settlement) => distance(hex, settlement.hex)),
    );
    if (nearestTown < 3 || nearestTown > 22) continue;
    dungeonCandidates.push({ index: i, hex, score: rng.next() * 2 + (t === "mountains" ? 1 : 0) });
  }

  const chosenDungeons: Array<{ index: number; hex: Hex }> = [];
  for (const candidate of dungeonCandidates.sort((a, b) => b.score - a.score)) {
    if (chosenDungeons.length >= dungeonCount) break;
    if (chosenDungeons.some((dungeon) => distance(dungeon.hex, candidate.hex) < 4)) continue;
    chosenDungeons.push(candidate);
  }

  const dungeonNames = rng.shuffle(DUNGEON_NAMES);
  for (let i = 0; i < chosenDungeons.length; i += 1) {
    const dungeon = chosenDungeons[i]!;
    const offset = offsetFromIndex(width, dungeon.index);
    const index = dungeon.index;
    if (world.terrain[index] === "mountains") world.terrain[index] = "hills";
    pushPoi(world, {
      id: `dungeon_${i}`,
      kind: "dungeon",
      name: dungeonNames[i % dungeonNames.length]!,
      offset,
      discovered: false,
      description: "A sealed entrance, a bad smell, and tracks that do not come back out.",
      levelBand: { min: 1, max: 4 },
    });
  }

  const landmarkNames = rng.shuffle([...SHRINE_NAMES, ...RUIN_NAMES]);
  let landmarkCount = 0;
  for (let attempt = 0; attempt < 500 && landmarkCount < 3; attempt += 1) {
    const index = rng.int(0, total);
    const t = world.terrain[index]!;
    if (isWaterTerrain(t) || t === "mountains") continue;
    const hex = offsetToAxial(offsetFromIndex(width, index));
    if (world.pois.some((poi) => distance(poi.hex, hex) < 3)) continue;
    const isShrine = landmarkCount % 2 === 0;
    pushPoi(world, {
      id: `landmark_${landmarkCount}`,
      kind: isShrine ? "shrine" : "ruin",
      name: landmarkNames[landmarkCount % landmarkNames.length]!,
      offset: offsetFromIndex(width, index),
      discovered: false,
      description: isShrine
        ? "A quiet place where travellers leave small offerings."
        : "Old stones and older foundations. The roof is gone; the walls remember.",
    });
    landmarkCount += 1;
  }

  buildRoads(world);

  return world;
}

function worldStats(world: MutableWorld): WorldReport["stats"] {
  const biomes: Record<string, number> = {};
  let landTiles = 0;
  let waterTiles = 0;
  for (const terrain of world.terrain) {
    biomes[terrain] = (biomes[terrain] ?? 0) + 1;
    if (isWaterTerrain(terrain)) waterTiles += 1;
    else landTiles += 1;
  }
  return {
    landTiles,
    waterTiles,
    settlements: world.pois.filter((poi) => poi.kind === "town" || poi.kind === "village").length,
    dungeons: world.pois.filter((poi) => poi.kind === "dungeon").length,
    rivers: world.river.filter((value) => value === 1).length,
    roads: world.road.filter((value) => value === 1).length,
    biomes,
  };
}

export function validateWorld(world: WorldState, elapsedMs = 0): WorldReport {
  const errors: WorldIssue[] = [];
  const warnings: WorldIssue[] = [];
  const total = world.width * world.height;
  const expectedArrays: Array<[string, readonly unknown[]]> = [
    ["terrain", world.terrain],
    ["elevation", world.elevation],
    ["moisture", world.moisture],
    ["temperature", world.temperature],
    ["river", world.river],
    ["road", world.road],
    ["fog", world.fog],
  ];
  for (const [name, array] of expectedArrays) {
    if (array.length !== total) {
      errors.push({
        code: "array_length",
        message: `${name} has ${array.length} entries; expected ${total}.`,
        severity: "error",
      });
    }
  }

  const mutable: MutableWorld = {
    width: world.width,
    height: world.height,
    terrain: world.terrain,
    elevation: world.elevation,
    moisture: world.moisture,
    temperature: world.temperature,
    river: world.river,
    road: world.road,
    pois: world.pois,
  };
  const stats = worldStats(mutable);
  const landFraction = total > 0 ? stats.landTiles / total : 0;
  if (landFraction < 0.12) {
    errors.push({
      code: "too_little_land",
      message: `Only ${(landFraction * 100).toFixed(1)}% of the map is land. Try a lower sea level.`,
      severity: "error",
    });
  }
  if (landFraction > 0.86) {
    errors.push({
      code: "too_much_land",
      message: `${(landFraction * 100).toFixed(1)}% of the map is land. Try a higher sea level.`,
      severity: "error",
    });
  }

  const towns = world.pois.filter((poi) => poi.kind === "town");
  const settlements = world.pois.filter((poi) => poi.kind === "town" || poi.kind === "village");
  if (towns.length === 0) {
    errors.push({
      code: "no_town",
      message: "No town was placed. Try another seed or a lower settlement density.",
      severity: "error",
    });
  }

  const waterDist = waterDistance(mutable);
  for (const settlement of settlements) {
    const index = axialIndex(world.width, world.height, settlement.hex);
    if (index < 0) {
      errors.push({
        code: "settlement_out_of_bounds",
        message: `${settlement.name} is outside the map.`,
        severity: "error",
        hex: settlement.hex,
      });
      continue;
    }
    if (isWaterTerrain(world.terrain[index]!)) {
      errors.push({
        code: "settlement_in_water",
        message: `${settlement.name} is standing in water.`,
        severity: "error",
        hex: settlement.hex,
      });
    }
    const distanceToWater = waterDist[index]!;
    if (distanceToWater < 0 || distanceToWater > 3) {
      errors.push({
        code: "settlement_no_water",
        message: `${settlement.name} has no fresh water within 3 hexes.`,
        severity: "error",
        hex: settlement.hex,
      });
    }
  }

  for (let i = 0; i < settlements.length; i += 1) {
    for (let j = i + 1; j < settlements.length; j += 1) {
      const a = settlements[i]!;
      const b = settlements[j]!;
      const minimum =
        a.kind === "town" && b.kind === "town" ? 5 : a.kind === "village" && b.kind === "village" ? 3 : 4;
      if (distance(a.hex, b.hex) < minimum) {
        warnings.push({
          code: "settlement_crowding",
          message: `${a.name} and ${b.name} are less than ${minimum} hexes apart.`,
          severity: "warning",
          hex: a.hex,
        });
      }
    }
  }

  for (const poi of world.pois) {
    const index = axialIndex(world.width, world.height, poi.hex);
    if (index < 0) {
      errors.push({
        code: "poi_out_of_bounds",
        message: `${poi.name} is outside the map.`,
        severity: "error",
        hex: poi.hex,
      });
      continue;
    }
    if (isWaterTerrain(world.terrain[index]!)) {
      errors.push({
        code: "poi_in_water",
        message: `${poi.name} is placed in water.`,
        severity: "error",
        hex: poi.hex,
      });
    }
    if (poi.kind === "dungeon" && world.terrain[index] !== "hills" && world.terrain[index] !== "mountains") {
      warnings.push({
        code: "dungeon_not_hilly",
        message: `${poi.name} is not in hills or mountains.`,
        severity: "warning",
        hex: poi.hex,
      });
    }
  }

  // Road connectivity between settlements.
  if (settlements.length > 1) {
    const roadCells = new Set<number>();
    for (let i = 0; i < total; i += 1) if (world.road[i]) roadCells.add(i);
    for (const settlement of settlements) {
      const index = axialIndex(world.width, world.height, settlement.hex);
      if (index >= 0) roadCells.add(index);
    }
    const start = axialIndex(world.width, world.height, settlements[0]!.hex);
    const reached = new Set<number>();
    if (start >= 0 && roadCells.has(start)) {
      const queue = [start];
      reached.add(start);
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const neighbor of offsetNeighbors(world.width, world.height, current)) {
          if (!roadCells.has(neighbor.index) || reached.has(neighbor.index)) continue;
          reached.add(neighbor.index);
          queue.push(neighbor.index);
        }
      }
    }
    for (const settlement of settlements) {
      const index = axialIndex(world.width, world.height, settlement.hex);
      if (index < 0 || !reached.has(index)) {
        errors.push({
          code: "settlement_disconnected",
          message: `${settlement.name} is not connected to the road network.`,
          severity: "error",
          hex: settlement.hex,
        });
      }
    }
  }

  // Rivers should have a downhill exit or terminate in water.
  for (let i = 0; i < total; i += 1) {
    if (!world.river[i]) continue;
    if (isWaterTerrain(world.terrain[i]!)) continue;
    const e = world.elevation[i]!;
    const hasExit = offsetNeighbors(world.width, world.height, i).some((neighbor) => {
      const other = world.elevation[neighbor.index]!;
      return isWaterTerrain(world.terrain[neighbor.index]!) || other < e + 0.0005;
    });
    if (!hasExit) {
      warnings.push({
        code: "river_stagnant",
        message: "A river has no downhill exit. It may be a dry wash.",
        severity: "warning",
        hex: offsetToAxial(offsetFromIndex(world.width, i)),
      });
      break;
    }
  }

  return {
    seed: world.seed,
    elapsedMs,
    passed: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

const HANDCRAFTED_SYMBOLS: Record<string, { terrain: string; river?: boolean; road?: boolean }> = {
  "~": { terrain: "ocean" },
  "-": { terrain: "coast" },
  b: { terrain: "beach" },
  ".": { terrain: "grassland" },
  f: { terrain: "forest" },
  "^": { terrain: "hills" },
  M: { terrain: "mountains" },
  s: { terrain: "swamp" },
  d: { terrain: "desert" },
  w: { terrain: "lake" },
  t: { terrain: "tundra" },
  S: { terrain: "snow" },
  "=": { terrain: "grassland", river: true },
  r: { terrain: "grassland", road: true },
};

export function buildHandcraftedWorld(pack: HandcraftedWorldPack, elapsedMs = 0): WorldGenResult {
  if (pack.rows.length !== pack.height) {
    throw new Error(`World pack ${pack.id} has ${pack.rows.length} rows; expected ${pack.height}.`);
  }
  for (const row of pack.rows) {
    if (row.length !== pack.width) {
      throw new Error(`World pack ${pack.id} has a row of length ${row.length}; expected ${pack.width}.`);
    }
  }

  const total = pack.width * pack.height;
  const terrain = new Array<string>(total).fill("ocean");
  const elevation = new Array<number>(total).fill(0.2);
  const moisture = new Array<number>(total).fill(0.5);
  const temperature = new Array<number>(total).fill(0.6);
  const river = new Array<number>(total).fill(0);
  const road = new Array<number>(total).fill(0);

  for (let row = 0; row < pack.height; row += 1) {
    const line = pack.rows[row]!;
    for (let col = 0; col < pack.width; col += 1) {
      const symbol = line[col] ?? "~";
      const definition = HANDCRAFTED_SYMBOLS[symbol] ?? HANDCRAFTED_SYMBOLS["~"]!;
      const index = row * pack.width + col;
      terrain[index] = definition.terrain;
      if (definition.river) river[index] = 1;
      if (definition.road) road[index] = 1;
      if (isWaterTerrain(definition.terrain)) elevation[index] = 0.2;
      else if (definition.terrain === "mountains") elevation[index] = 0.86;
      else if (definition.terrain === "hills") elevation[index] = 0.7;
      else elevation[index] = 0.55;
    }
  }

  const pois: PointOfInterest[] = pack.pois.map((poi) => ({
    id: poi.id,
    kind: poi.kind,
    name: poi.name,
    hex: offsetToAxial({ col: poi.col, row: poi.row }),
    discovered: false,
    description: poi.description,
    size: poi.kind === "town" ? "town" : poi.kind === "village" ? "village" : undefined,
    levelBand: poi.kind === "dungeon" ? { min: 1, max: 3 } : undefined,
  }));

  for (const path of pack.roads ?? []) {
    for (const point of path) {
      if (!inBounds(pack.width, pack.height, point)) continue;
      const index = cellIndex(pack.width, point);
      if (!isWaterTerrain(terrain[index]!)) road[index] = 1;
    }
  }

  const world: WorldState = {
    id: `handcrafted:${pack.id}`,
    name: pack.name,
    source: "handcrafted",
    packId: pack.id,
    seed: pack.id,
    width: pack.width,
    height: pack.height,
    terrain,
    elevation,
    moisture,
    temperature,
    river,
    road,
    pois,
    fog: new Array<number>(total).fill(0),
  };

  buildRoads({
    width: world.width,
    height: world.height,
    terrain: world.terrain,
    elevation: world.elevation,
    moisture: world.moisture,
    temperature: world.temperature,
    river: world.river,
    road: world.road,
    pois: world.pois,
  });

  return { world, report: validateWorld(world, elapsedMs) };
}

export function generateWorld(request: WorldGenRequest): WorldGenResult {
  const started = Date.now();
  if (request.source === "handcrafted") {
    const packId = request.packId ?? "core:redford_reach";
    const pack = getHandcraftedWorldPack(packId);
    if (!pack) throw new Error(`Unknown handcrafted world pack: ${packId}`);
    return buildHandcraftedWorld(pack, Date.now() - started);
  }

  const mutable = generateProcedural(WorldGenParamsSchema.parse(request.params ?? {}), request.seed);
  const rng = createRng(`worldname:${request.seed}`);
  const name = `${rng.pick(WORLD_PREFIXES)} ${rng.pick(WORLD_SUFFIXES)}`;
  const world: WorldState = {
    id: `procedural:${request.seed}`,
    name,
    source: "procedural",
    seed: request.seed,
    width: mutable.width,
    height: mutable.height,
    terrain: mutable.terrain,
    elevation: mutable.elevation,
    moisture: mutable.moisture,
    temperature: mutable.temperature,
    river: mutable.river,
    road: mutable.road,
    pois: mutable.pois,
    fog: new Array<number>(mutable.width * mutable.height).fill(0),
  };
  return { world, report: validateWorld(world, Date.now() - started) };
}

export function terrainName(terrainId: string): string {
  return getTerrain(terrainId).name;
}

export function isWaterAt(world: WorldState, h: Hex): boolean {
  const index = axialIndex(world.width, world.height, h);
  if (index < 0) return true;
  return isWaterTerrain(world.terrain[index]!);
}

export function worldTerrainColor(terrainId: string): number {
  return getTerrain(terrainId).color;
}

export function worldBiomes(): string[] {
  return TERRAINS.map((terrain) => terrain.id);
}

// Re-exported for UI convenience without importing hex/grid separately.
export { add, axialToOffset, hex, hexKey, neighbors, offsetToAxial };
