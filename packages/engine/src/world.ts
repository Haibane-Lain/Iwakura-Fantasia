import { getTerrain, isWaterTerrain } from "@iwakura/content";
import type {
  CampaignSettings,
  CharacterBuild,
  Clock,
  GameState,
  Hex,
  PointOfInterest,
  WorldState,
} from "@iwakura/contracts";
import { createPlayerEntity, defaultCharacterBuild } from "./character.js";
import { axialIndex, hexesInWorldRadius } from "./grid.js";
import { distance, findPath, hexKey, spiral } from "./hex.js";
import { createRng } from "./rng.js";
import { rngFromGameState } from "./state-rng.js";

export function terrainAt(world: WorldState, h: Hex): string {
  const index = axialIndex(world.width, world.height, h);
  return index >= 0 ? (world.terrain[index] ?? "ocean") : "ocean";
}

export function poiAt(world: WorldState, h: Hex): PointOfInterest | undefined {
  return world.pois.find((poi) => poi.hex.q === h.q && poi.hex.r === h.r);
}

export function movementCostAt(world: WorldState, h: Hex): number | null {
  const index = axialIndex(world.width, world.height, h);
  if (index < 0) return null;
  const terrain = getTerrain(world.terrain[index] ?? "ocean");
  if (terrain.water || terrain.movementCost === null) return null;
  if (world.road[index]) return 1;
  let cost = terrain.movementCost;
  if (world.river[index]) cost += 4;
  return cost;
}

export function worldCost(world: WorldState): (h: Hex) => number | null {
  return (h) => movementCostAt(world, h);
}

export function pathBetween(world: WorldState, from: Hex, to: Hex): { path: Hex[]; cost: number } | null {
  const result = findPath(from, to, worldCost(world), 120_000);
  if (!result) return null;
  return result;
}

export function revealFog(world: WorldState, center: Hex, radius = 4): WorldState {
  const fog = [...world.fog];
  for (let i = 0; i < fog.length; i += 1) {
    if (fog[i] === 2) fog[i] = 1;
  }

  const visible = hexesInWorldRadius(world.width, world.height, center, radius);
  const visibleKeys = new Set(visible.map((entry) => hexKey(entry.hex)));
  for (const entry of visible) fog[entry.index] = 2;

  const pois = world.pois.map((poi) =>
    visibleKeys.has(hexKey(poi.hex)) ? { ...poi, discovered: true } : poi,
  );

  return { ...world, fog, pois };
}

export function findStartHex(world: WorldState): Hex {
  const town = world.pois.find((poi) => poi.kind === "town");
  const candidates = town
    ? spiral(town.hex, 3)
    : spiral({ q: Math.floor(world.width / 2), r: Math.floor(world.height / 2) }, 4);
  for (const candidate of candidates) {
    if (!isWaterTerrain(terrainAt(world, candidate))) return candidate;
  }
  for (let r = 0; r < world.height; r += 1) {
    for (let q = -Math.floor(r / 2); q < world.width; q += 1) {
      const candidate = { q, r };
      if (!isWaterTerrain(terrainAt(world, candidate))) return candidate;
    }
  }
  return { q: 0, r: 0 };
}

export function advanceClock(clock: Clock, minutes: number): Clock {
  const total = clock.hour * 60 + clock.minute + Math.max(0, Math.round(minutes));
  const dayOffset = Math.floor(total / 1440);
  const remainder = ((total % 1440) + 1440) % 1440;
  return {
    day: clock.day + dayOffset,
    hour: Math.floor(remainder / 60),
    minute: remainder % 60,
  };
}

export function formatClock(clock: Clock): string {
  const hh = String(clock.hour).padStart(2, "0");
  const mm = String(clock.minute).padStart(2, "0");
  return `Day ${clock.day} · ${hh}:${mm}`;
}

export function timeOfDay(clock: Clock): "night" | "dawn" | "morning" | "afternoon" | "dusk" {
  if (clock.hour < 5) return "night";
  if (clock.hour < 8) return "dawn";
  if (clock.hour < 12) return "morning";
  if (clock.hour < 18) return "afternoon";
  if (clock.hour < 21) return "dusk";
  return "night";
}

export interface CreateGameStateOptions {
  world: WorldState;
  settings: CampaignSettings;
  campaignId: string;
  campaignName: string;
  build?: CharacterBuild;
  playerName?: string;
  now?: Date;
}

export function createGameState(options: CreateGameStateOptions): GameState {
  const start = findStartHex(options.world);
  const revealed = revealFog(options.world, start, 5);
  const rng = createRng(`campaign:${options.world.seed}`);
  const snapshot = rng.snapshot();
  const now = options.now ?? new Date();
  const build = options.build ?? defaultCharacterBuild(options.playerName ?? "Wanderer");
  const player = { ...createPlayerEntity(build), hex: start };

  return {
    version: 1,
    campaign: {
      id: options.campaignId,
      name: options.campaignName,
      settings: options.settings,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      playtimeSeconds: 0,
    },
    clock: { day: 1, hour: 8, minute: 0 },
    world: revealed,
    party: {
      id: "party",
      name: "The Unnamed Company",
      memberIds: [player.id],
      gold: 25,
      position: start,
    },
    entities: { [player.id]: player },
    quests: {},
    factions: {},
    relationships: {},
    flags: {},
    rng: { seed: snapshot.seed, state: snapshot.state, cursor: snapshot.cursor },
  };
}

export interface MoveResult {
  state: GameState;
  path: Hex[];
  cost: number;
  minutes: number;
  encounter: boolean;
}

export function moveParty(state: GameState, to: Hex): MoveResult | null {
  if (state.party.position.q === to.q && state.party.position.r === to.r) return null;
  const route = pathBetween(state.world, state.party.position, to);
  if (!route) return null;
  if (route.path.length === 0) return null;

  const minutes = Math.max(10, route.cost * 10);
  const clock = advanceClock(state.clock, minutes);
  const revealed = revealFog(state.world, to, 5);
  const rng = rngFromGameState(state);
  const danger = state.campaign.settings.genParams.danger;
  const encounterChance = danger === "deadly" ? 0.18 : danger === "peaceful" ? 0.02 : 0.08;
  const encounter = rng.chance(encounterChance);
  const rngSnapshot = rng.snapshot();

  const entities = { ...state.entities };
  const player = entities.player;
  if (player) entities.player = { ...player, hex: to };

  return {
    state: {
      ...state,
      clock,
      world: revealed,
      party: { ...state.party, position: to },
      entities,
      campaign: { ...state.campaign, updatedAt: new Date().toISOString() },
      rng: { seed: rngSnapshot.seed, state: rngSnapshot.state, cursor: rngSnapshot.cursor },
    },
    path: route.path,
    cost: route.cost,
    minutes,
    encounter,
  };
}

export function nearbyPois(world: WorldState, from: Hex, radius = 8): PointOfInterest[] {
  return world.pois
    .filter((poi) => distance(poi.hex, from) <= radius)
    .sort((a, b) => distance(a.hex, from) - distance(b.hex, from));
}
