import { getEnemy, getLocalTile, getTerrain, isWaterTerrain } from "@iwakura/content";
import type {
  GameState,
  Hex,
  LocalBuilding,
  LocalExit,
  LocalInteractable,
  LocalMap,
  PointOfInterest,
  TravelEnemyGroup,
  TravelGate,
  TravelState,
} from "@iwakura/contracts";
import { startBattle } from "./battle.js";
import { axialIndex, axialToOffset, offsetToAxial } from "./grid.js";
import { distance, hexKey, line, lineOfSight, neighbor, neighbors } from "./hex.js";
import { enterLocalMap, localIsWalkable, progressQuests } from "./local.js";
import { fbm } from "./noise.js";
import { createRng, hashString } from "./rng.js";
import { advanceClock } from "./time.js";
import { pathBetween, poiAt, revealFog, terrainAt } from "./world.js";

export const TRAVEL_MAP_WIDTH = 40;
export const TRAVEL_MAP_HEIGHT = 28;
const TRAVEL_MAP_VERSION = 1;

export const TRAVEL_DIRECTION_NAMES = [
  "East",
  "North-east",
  "North-west",
  "West",
  "South-west",
  "South-east",
] as const;

interface Port {
  direction: number;
  center: Hex;
  tiles: Hex[];
}

function portFor(direction: number): Port {
  const width = TRAVEL_MAP_WIDTH;
  const height = TRAVEL_MAP_HEIGHT;
  const positions: Record<number, { col: number; row: number }> = {
    0: { col: width - 2, row: Math.floor(height / 2) },
    1: { col: Math.floor(width * 0.78), row: 1 },
    2: { col: Math.floor(width * 0.22), row: 1 },
    3: { col: 1, row: Math.floor(height / 2) },
    4: { col: Math.floor(width * 0.22), row: height - 2 },
    5: { col: Math.floor(width * 0.78), row: height - 2 },
  };
  const point = positions[direction] ?? positions[0]!;
  const tiles: Hex[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const col = point.col + dc;
      const row = point.row + dr;
      if (col >= 0 && col < width && row >= 0 && row < height) {
        tiles.push(offsetToAxial({ col, row }));
      }
    }
  }
  return { direction, center: offsetToAxial(point), tiles };
}

export function travelPortHex(direction: number): Hex {
  return portFor(direction).center;
}

export function oppositeDirection(direction: number): number {
  return (direction + 3) % 6;
}

function offsetOf(hex: Hex): { col: number; row: number } {
  return axialToOffset(hex);
}

function inMap(hex: Hex): boolean {
  const offset = offsetOf(hex);
  return (
    offset.col >= 0 && offset.col < TRAVEL_MAP_WIDTH && offset.row >= 0 && offset.row < TRAVEL_MAP_HEIGHT
  );
}

function tileIndex(hex: Hex): number {
  const offset = offsetOf(hex);
  return offset.row * TRAVEL_MAP_WIDTH + offset.col;
}

function getTile(tiles: string[], hex: Hex): string {
  if (!inMap(hex)) return "cliff";
  return tiles[tileIndex(hex)] ?? "grass";
}

function setTile(tiles: string[], hex: Hex, tile: string): void {
  if (!inMap(hex)) return;
  tiles[tileIndex(hex)] = tile;
}

function isBlockedTile(tile: string): boolean {
  return !getLocalTile(tile).walkable;
}

function makeWalkable(tiles: string[], hex: Hex, road = false): void {
  if (!inMap(hex)) return;
  const current = getTile(tiles, hex);
  if (current === "water") {
    setTile(tiles, hex, "bridge");
    return;
  }
  if (isBlockedTile(current) || road) setTile(tiles, hex, road ? "road" : "grass");
}

function carvePath(tiles: string[], from: Hex, to: Hex, road: boolean): void {
  for (const step of line(from, to)) makeWalkable(tiles, step, road);
}

function terrainBase(terrain: string, noise: number): string {
  switch (terrain) {
    case "forest":
      return noise > 0.47 ? "tree" : noise < 0.28 ? "brush" : "grass";
    case "hills":
      return noise > 0.76 ? "cliff" : noise > 0.56 ? "rock" : noise > 0.31 ? "high_ground" : "grass";
    case "mountains":
      return noise > 0.69 ? "cliff" : noise > 0.41 ? "rock" : "high_ground";
    case "swamp":
      return noise > 0.74 ? "water" : noise > 0.37 ? "marsh" : "grass";
    case "desert":
      return noise > 0.78 ? "rock" : noise > 0.3 ? "sand" : "field";
    case "steppe":
      return noise > 0.75 ? "brush" : noise > 0.36 ? "field" : "grass";
    case "tundra":
      return noise > 0.7 ? "rock" : noise > 0.34 ? "snow" : "field";
    case "snow":
      return noise > 0.7 ? "rock" : "snow";
    case "beach":
      return noise > 0.7 ? "water" : "sand";
    case "coast":
    case "ocean":
    case "lake":
      return "water";
    default:
      return noise > 0.72 ? "tree" : noise > 0.3 ? "grass" : "field";
  }
}

function edgeBlocked(terrain: string): string {
  if (isWaterTerrain(terrain)) return "water";
  if (terrain === "mountains" || terrain === "hills") return "cliff";
  if (terrain === "forest" || terrain === "swamp") return "tree";
  if (terrain === "desert" || terrain === "beach") return "rock";
  return "tree";
}

function worldNeighbor(direction: number, origin: Hex): Hex {
  return neighbor(origin, direction);
}

function neighborIsTravelable(state: GameState, direction: number, origin: Hex): boolean {
  const next = worldNeighbor(direction, origin);
  const index = axialIndex(state.world.width, state.world.height, next);
  return index >= 0 && !isWaterTerrain(terrainAt(state.world, next));
}

function clearedGroupsFor(state: GameState, hex: Hex): string[] {
  const value = state.flags[`travel.cleared.${hexKey(hex)}`];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function safeSpawn(
  tiles: string[],
  center: Hex,
  used: Hex[],
  minCenterDistance: number,
  rng: ReturnType<typeof createRng>,
): Hex | null {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const col = rng.int(2, TRAVEL_MAP_WIDTH - 2);
    const row = rng.int(2, TRAVEL_MAP_HEIGHT - 2);
    const hex = offsetToAxial({ col, row });
    if (distance(hex, center) < minCenterDistance) continue;
    if (!getLocalTile(getTile(tiles, hex)).walkable) continue;
    if (used.some((entry) => distance(entry, hex) < 5)) continue;
    return hex;
  }
  return null;
}

function poiAnchor(
  poi: PointOfInterest,
  tiles: string[],
  center: Hex,
  entry: Hex,
): { gateHex: Hex; outsideHex: Hex } {
  const angle = hashString(`${poi.id}:gate`) % 6;
  const distanceFromCenter = poi.kind === "town" || poi.kind === "village" ? 4 : 5;
  let gateHex = center;
  for (let step = 0; step < distanceFromCenter; step += 1) gateHex = neighbor(gateHex, angle);
  if (!inMap(gateHex) || distance(gateHex, entry) < 4) {
    gateHex =
      neighbors(center)
        .map((hex) => neighbor(hex, angle))
        .find((hex) => inMap(hex) && distance(hex, entry) >= 4) ?? center;
  }
  if (!inMap(gateHex)) gateHex = center;
  makeWalkable(tiles, gateHex, false);
  carvePath(tiles, gateHex, center, true);
  if (poi.kind === "town" || poi.kind === "village") {
    for (const nearby of neighbors(gateHex)) {
      if (!inMap(nearby)) continue;
      const tile = getTile(tiles, nearby);
      if (tile === "grass" || tile === "field") setTile(tiles, nearby, "crop");
    }
  }
  let outsideHex = neighbor(gateHex, angle);
  if (!inMap(outsideHex) || !getLocalTile(getTile(tiles, outsideHex)).walkable) {
    outsideHex =
      neighbors(gateHex).find(
        (hex) =>
          inMap(hex) &&
          distance(hex, center) > distance(gateHex, center) &&
          getLocalTile(getTile(tiles, hex)).walkable,
      ) ?? gateHex;
  }
  makeWalkable(tiles, outsideHex, false);
  return { gateHex, outsideHex };
}

function buildTravelMap(state: GameState, worldHex: Hex): LocalMap {
  const terrain = terrainAt(state.world, worldHex);
  const worldIndex = axialIndex(state.world.width, state.world.height, worldHex);
  const elevation = worldIndex >= 0 ? (state.world.elevation[worldIndex] ?? 0.5) : 0.5;
  const moisture = worldIndex >= 0 ? (state.world.moisture[worldIndex] ?? 0.5) : 0.5;
  const noiseSeed = hashString(
    `travel:${state.world.seed}:${worldHex.q}:${worldHex.r}:${TRAVEL_MAP_VERSION}`,
  );
  const rng = createRng(`${state.world.seed}:travel:${worldHex.q}:${worldHex.r}:${TRAVEL_MAP_VERSION}`);
  const tiles = new Array<string>(TRAVEL_MAP_WIDTH * TRAVEL_MAP_HEIGHT);

  for (let row = 0; row < TRAVEL_MAP_HEIGHT; row += 1) {
    for (let col = 0; col < TRAVEL_MAP_WIDTH; col += 1) {
      const nx = col / TRAVEL_MAP_WIDTH;
      const ny = row / TRAVEL_MAP_HEIGHT;
      const noise = fbm(nx * 5.2 + 0.11, ny * 5.2 - 0.07, noiseSeed, 4);
      let tile = terrainBase(terrain, noise);
      if (terrain === "grassland" && moisture > 0.67 && noise > 0.62) tile = "brush";
      if (terrain === "hills" && elevation < 0.35 && noise > 0.42) tile = "grass";
      if (terrain === "swamp" && moisture < 0.35) tile = noise > 0.55 ? "grass" : "marsh";
      if (tile === "water" && terrain !== "swamp" && !isWaterTerrain(terrain)) tile = "marsh";
      tiles[row * TRAVEL_MAP_WIDTH + col] = tile;
    }
  }

  const border = edgeBlocked(terrain);
  for (let col = 0; col < TRAVEL_MAP_WIDTH; col += 1) {
    setTile(tiles, offsetToAxial({ col, row: 0 }), border);
    setTile(tiles, offsetToAxial({ col, row: TRAVEL_MAP_HEIGHT - 1 }), border);
  }
  for (let row = 0; row < TRAVEL_MAP_HEIGHT; row += 1) {
    setTile(tiles, offsetToAxial({ col: 0, row }), border);
    setTile(tiles, offsetToAxial({ col: TRAVEL_MAP_WIDTH - 1, row }), border);
  }

  const center = offsetToAxial({
    col: Math.floor(TRAVEL_MAP_WIDTH / 2),
    row: Math.floor(TRAVEL_MAP_HEIGHT / 2),
  });
  const exits: LocalExit[] = [];
  for (let direction = 0; direction < 6; direction += 1) {
    if (!neighborIsTravelable(state, direction, worldHex)) continue;
    const port = portFor(direction);
    for (const hex of port.tiles) makeWalkable(tiles, hex, true);
    carvePath(tiles, port.center, center, true);
    exits.push({
      id: `travel:edge:${worldHex.q},${worldHex.r}:${direction}`,
      name: TRAVEL_DIRECTION_NAMES[direction]!,
      hex: port.center,
      description: "The road continues into the next stretch of country.",
      target: "travel",
      direction,
    });
  }

  const gates: TravelGate[] = [];
  const buildings: LocalBuilding[] = [];
  const interactables: LocalInteractable[] = [];
  const pois = state.world.pois.filter((poi) => hexKey(poi.hex) === hexKey(worldHex));
  for (const poi of pois) {
    const anchor = poiAnchor(poi, tiles, center, center);
    if (poi.kind === "town" || poi.kind === "village" || poi.kind === "dungeon") {
      gates.push({
        poiId: poi.id,
        name: poi.name,
        kind: poi.kind,
        gateHex: anchor.gateHex,
        outsideHex: anchor.outsideHex,
      });
      buildings.push({
        id: `travel:gate:${poi.id}`,
        name: poi.name,
        kind: poi.kind === "dungeon" ? "other" : "gate",
        hex: anchor.gateHex,
        description:
          poi.kind === "dungeon"
            ? "A dark opening in the hillside."
            : "A gate in the settlement wall, with a road running through it.",
      });
    }
    interactables.push({
      id: `travel:poi:${poi.id}`,
      name: poi.name,
      kind:
        poi.kind === "dungeon"
          ? "stairs"
          : poi.kind === "shrine"
            ? "shrine"
            : poi.kind === "ruin"
              ? "altar"
              : poi.kind === "camp"
                ? "object"
                : "sign",
      hex: anchor.gateHex,
      description: poi.description || `The ${poi.kind} of ${poi.name}.`,
      oneShot: false,
    });
  }

  if (worldIndex >= 0 && state.world.river[worldIndex] === 1) {
    const vertical = rng.chance(0.55);
    const band = rng.int(0, 5) - 2;
    if (vertical) {
      const riverCol = Math.floor(TRAVEL_MAP_WIDTH / 2) + band;
      for (let row = 2; row < TRAVEL_MAP_HEIGHT - 2; row += 1) {
        const col = riverCol + (fbm(row * 0.13, 0.4, noiseSeed + 7, 2) > 0.52 ? 1 : 0);
        setTile(tiles, offsetToAxial({ col, row }), "water");
      }
    } else {
      const riverRow = Math.floor(TRAVEL_MAP_HEIGHT / 2) + band;
      for (let col = 2; col < TRAVEL_MAP_WIDTH - 2; col += 1) {
        const row = riverRow + (fbm(col * 0.13, 0.4, noiseSeed + 11, 2) > 0.52 ? 1 : 0);
        setTile(tiles, offsetToAxial({ col, row }), "water");
      }
    }
    // Make sure every open gate can still reach the center; roads become bridges
    // where they cross the generated river.
    for (const exit of exits) carvePath(tiles, exit.hex, center, true);
    for (const gate of gates) carvePath(tiles, gate.gateHex, center, true);
  }

  makeWalkable(tiles, center, true);
  for (const exit of exits) makeWalkable(tiles, exit.hex, true);

  const map: LocalMap = {
    id: `travel:${worldHex.q},${worldHex.r}`,
    name: `${getTerrain(terrain).name} travel`,
    kind: "wilderness",
    description: getTerrain(terrain).description,
    width: TRAVEL_MAP_WIDTH,
    height: TRAVEL_MAP_HEIGHT,
    tiles,
    entrance: center,
    buildings,
    exits,
    interactables,
    encounters: [],
    spots: {
      center,
      ...Object.fromEntries(gates.map((gate) => [`gate:${gate.poiId}`, gate.gateHex])),
      ...Object.fromEntries(gates.map((gate) => [`outside:${gate.poiId}`, gate.outsideHex])),
    },
  };

  return map;
}

export interface CreateTravelOptions {
  entryEdge?: number;
  position?: Hex;
  gateOutside?: Hex;
}

export function createTravelState(
  state: GameState,
  worldHex: Hex,
  options: CreateTravelOptions = {},
): TravelState | null {
  if (isWaterTerrain(terrainAt(state.world, worldHex))) return null;
  const map = buildTravelMap(state, worldHex);
  let position = options.position ?? map.entrance;
  if (options.entryEdge !== undefined) {
    const port = portFor(oppositeDirection(options.entryEdge)).center;
    const inward = neighbor(port, options.entryEdge);
    position = localIsWalkable(map, inward) ? inward : port;
  }
  if (!localIsWalkable(map, position)) {
    position =
      [
        map.entrance,
        ...neighbors(map.entrance),
        ...neighbors(neighbors(map.entrance)[0] ?? map.entrance),
      ].find((hex) => inMap(hex) && localIsWalkable(map, hex)) ?? map.entrance;
  }
  const gates = state.world.pois
    .filter((poi) => hexKey(poi.hex) === hexKey(worldHex))
    .filter((poi) => poi.kind === "town" || poi.kind === "village" || poi.kind === "dungeon")
    .map((poi) => {
      const gate = map.buildings.find((entry) => entry.id === `travel:gate:${poi.id}`);
      const gateHex = gate?.hex ?? map.entrance;
      const outside =
        map.spots[`outside:${poi.id}`] ??
        neighbors(gateHex).find((hex) => inMap(hex) && localIsWalkable(map, hex)) ??
        gateHex;
      return {
        poiId: poi.id,
        name: poi.name,
        kind: poi.kind,
        gateHex,
        outsideHex: outside,
      };
    });
  return {
    map,
    worldHex,
    position,
    facing: 0,
    ...(options.entryEdge !== undefined ? { entryEdge: oppositeDirection(options.entryEdge) } : {}),
    gates,
    ...(options.gateOutside ? { gateOutside: options.gateOutside } : {}),
    enemies: buildTravelEnemies(state, worldHex, map),
    clearedGroupIds: clearedGroupsFor(state, worldHex),
  };
}

function buildTravelEnemies(state: GameState, worldHex: Hex, map: LocalMap): TravelEnemyGroup[] {
  // Generation is deterministic; this duplicate pass keeps the enemy list tied
  // to the finished map after roads and gates have carved walkable routes.
  const cleared = clearedGroupsFor(state, worldHex);
  const danger = state.campaign.settings.genParams.danger;
  const targetGroups = danger === "peaceful" ? 0 : danger === "deadly" ? 4 : 2;
  const rng = createRng(
    `${state.world.seed}:travel-enemies:${worldHex.q}:${worldHex.r}:${TRAVEL_MAP_VERSION}`,
  );
  const terrain = terrainAt(state.world, worldHex);
  const gates = state.world.pois.filter((poi) => hexKey(poi.hex) === hexKey(worldHex));
  const used: Hex[] = [map.entrance, ...map.buildings.map((building) => building.hex)];
  const enemies: TravelEnemyGroup[] = [];
  for (let index = 0; index < targetGroups; index += 1) {
    const id = `travel:${worldHex.q},${worldHex.r}:group:${index}`;
    if (cleared.includes(id)) continue;
    const spawn = safeSpawn(map.tiles, map.entrance, used, gates.length > 0 ? 8 : 6, rng);
    if (!spawn) continue;
    used.push(spawn);
    const primary = getEnemy(terrain === "forest" || terrain === "swamp" ? "core:wolf" : "core:bandit");
    const secondary = getEnemy(primary?.id === "core:wolf" ? "core:bandit" : "core:wolf");
    const enemyIds = primary ? [primary.id] : ["core:bandit"];
    if (secondary && rng.chance(0.45)) enemyIds.push(secondary.id);
    enemies.push({
      id,
      name: primary?.name ?? "Road threat",
      enemyIds,
      hex: spawn,
      aggroRadius: danger === "deadly" ? 6 : 5,
      patrolRadius: 2,
      description: "A knot of trouble waiting beside the road.",
    });
  }
  return enemies;
}

export interface EnterTravelResult {
  state: GameState;
  travel: TravelState;
}

export function enterTravelMap(
  state: GameState,
  options: CreateTravelOptions = {},
): EnterTravelResult | null {
  const worldHex = state.party.position;
  const travel = createTravelState(state, worldHex, options);
  if (!travel) return null;
  const player = state.entities.player;
  const entities = player
    ? {
        ...state.entities,
        player: { ...player, hex: worldHex, localMapId: undefined },
      }
    : state.entities;
  const next: GameState = {
    ...state,
    travel,
    local: undefined,
    entities,
    world: revealFog(state.world, worldHex, 5),
    campaign: { ...state.campaign, updatedAt: new Date().toISOString() },
  };
  return { state: next, travel };
}

export function syncTravelPosition(state: GameState, hex: Hex, facing?: number): GameState {
  if (!state.travel) return state;
  if (state.travel.position.q === hex.q && state.travel.position.r === hex.r && facing === undefined)
    return state;
  return {
    ...state,
    travel: {
      ...state.travel,
      position: hex,
      ...(facing !== undefined ? { facing: ((facing % 6) + 6) % 6 } : {}),
    },
    campaign: { ...state.campaign, updatedAt: new Date().toISOString() },
  };
}

export interface CrossTravelResult {
  state: GameState;
  travel: TravelState;
  message: string;
}

export function crossTravelEdge(state: GameState, direction: number): CrossTravelResult | null {
  const travel = state.travel;
  if (!travel) return null;
  const nextWorldHex = neighbor(travel.worldHex, direction);
  const nextTravel = createTravelState(state, nextWorldHex, { entryEdge: direction });
  if (!nextTravel) return null;
  const player = state.entities.player;
  const entities = player
    ? { ...state.entities, player: { ...player, hex: nextWorldHex, localMapId: undefined } }
    : state.entities;
  const next: GameState = {
    ...state,
    world: revealFog(state.world, nextWorldHex, 5),
    party: { ...state.party, position: nextWorldHex },
    entities,
    travel: nextTravel,
    local: undefined,
    clock: advanceClock(state.clock, 9),
    campaign: { ...state.campaign, updatedAt: new Date().toISOString() },
  };
  const nextPoi = poiAt(next.world, nextWorldHex);
  return {
    state: nextPoi ? progressQuests(next, { kind: "reach", targetId: nextPoi.id }) : next,
    travel: nextTravel,
    message: `${TRAVEL_DIRECTION_NAMES[direction]} — the road enters ${getTerrain(terrainAt(next.world, nextWorldHex)).name}.`,
  };
}

export function travelGateAt(state: GameState, hex: Hex): TravelGate | undefined {
  return state.travel?.gates.find((gate) => distance(gate.gateHex, hex) === 0);
}

export function travelNearbyGate(state: GameState, hex: Hex, radius = 2): TravelGate | undefined {
  return state.travel?.gates.find((gate) => distance(gate.gateHex, hex) <= radius);
}

export function travelEdgeAt(state: GameState, hex: Hex) {
  return state.travel?.map.exits.find((exit) => exit.target === "travel" && distance(exit.hex, hex) === 0);
}

export function travelInteractableAt(state: GameState, hex: Hex): LocalInteractable | undefined {
  return state.travel?.map.interactables.find((entry) => distance(entry.hex, hex) === 0);
}

export function travelEnemyNear(state: GameState, hex: Hex): TravelEnemyGroup | undefined {
  const travel = state.travel;
  if (!travel) return undefined;
  const blocks = (candidate: Hex) => !localIsWalkable(travel.map, candidate);
  return travel.enemies.find(
    (group) => distance(group.hex, hex) <= group.aggroRadius && lineOfSight(hex, group.hex, blocks),
  );
}

export function beginTravelBattle(state: GameState, groupId: string): GameState | null {
  const group = state.travel?.enemies.find((entry) => entry.id === groupId);
  if (!group) return null;
  const next = startBattle(state, {
    enemyIds: group.enemyIds,
    source: "travel",
    travelGroupId: group.id,
    enemyPositions: [group.hex, ...neighbors(group.hex)],
  });
  return next;
}

export function enterTravelGate(state: GameState, poiId: string): GameState | null {
  const gate = state.travel?.gates.find((entry) => entry.poiId === poiId);
  if (!gate) return null;
  const entered = enterLocalMap(state, poiId);
  if (!entered) return null;
  return {
    ...entered.state,
    travel: state.travel ? { ...state.travel, gateOutside: gate.outsideHex } : state.travel,
  };
}

export function leaveNearbyGate(state: GameState): GameState | null {
  const travel = state.travel;
  if (!travel) return null;
  const gate = travel.gates[0];
  if (!gate) return null;
  return enterTravelGate(state, gate.poiId);
}

export interface FastTravelResult {
  state: GameState;
  path: Hex[];
  minutes: number;
  message: string;
}

export function fastTravel(state: GameState, destination: Hex): FastTravelResult | null {
  if (state.battle || state.local) return null;
  const route = pathBetween(state.world, state.party.position, destination);
  if (!route || route.path.length === 0) return null;
  const destinationPoi = poiAt(state.world, destination);
  if (destinationPoi && !destinationPoi.discovered) return null;
  const minutes = Math.max(10, route.cost * 10);
  const player = state.entities.player;
  const entities = player ? { ...state.entities, player: { ...player, hex: destination } } : state.entities;
  const moved: GameState = {
    ...state,
    clock: advanceClock(state.clock, minutes),
    world: revealFog(state.world, destination, 5),
    party: { ...state.party, position: destination },
    entities,
    travel: undefined,
    local: undefined,
    campaign: { ...state.campaign, updatedAt: new Date().toISOString() },
  };
  const arrivedTravel = createTravelState(moved, destination);
  const destinationGate = arrivedTravel?.gates.find((gate) => gate.poiId === destinationPoi?.id);
  const travel = arrivedTravel
    ? {
        ...arrivedTravel,
        ...(destinationGate
          ? { position: destinationGate.outsideHex, gateOutside: destinationGate.outsideHex }
          : {}),
      }
    : undefined;
  const progressed = destinationPoi
    ? progressQuests(
        { ...moved, ...(travel ? { travel } : {}) },
        { kind: "reach", targetId: destinationPoi.id },
      )
    : { ...moved, ...(travel ? { travel } : {}) };
  return {
    state: progressed,
    path: route.path,
    minutes,
    message: destinationPoi
      ? `Fast travelled to ${destinationPoi.name} in ${Math.round(minutes / 60)} hours.`
      : `Fast travelled across ${route.path.length} hexes in ${minutes} minutes.`,
  };
}

export function travelObjectiveAt(state: GameState, hex: Hex): PointOfInterest | undefined {
  return state.world.pois.find(
    (poi) =>
      hexKey(poi.hex) === hexKey(state.travel?.worldHex ?? state.party.position) &&
      distance(poi.hex, hex) <= 2,
  );
}

export function travelMapSeed(state: GameState, hex: Hex): string {
  return `${state.world.seed}:${hexKey(hex)}:${TRAVEL_MAP_VERSION}`;
}

export function travelDirectionToNeighbor(state: GameState, target: Hex): number | undefined {
  for (let direction = 0; direction < 6; direction += 1) {
    if (hexKey(neighbor(state.party.position, direction)) === hexKey(target)) return direction;
  }
  return undefined;
}

export function travelDistanceToEdge(state: GameState, direction: number): number | null {
  const exit = state.travel?.map.exits.find((entry) => entry.direction === direction);
  return exit ? distance(state.travel!.position, exit.hex) : null;
}

export { buildTravelMap as generateTravelMap };
