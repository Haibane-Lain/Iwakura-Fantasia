import { getAbility, getEnemy, getItem } from "@iwakura/content";
import type {
  BattleState,
  BattleUnit,
  EnemyDefinition,
  Entity,
  GameState,
  Hex,
  LocalMap,
} from "@iwakura/contracts";
import { abilityModifier, proficiencyBonus } from "./character.js";
import { axialIndex, offsetToAxial } from "./grid.js";
import { distance, findPath, hexKey, lineOfSight, neighbors } from "./hex.js";
import { localIsWalkable } from "./local.js";
import { rngFromGameState } from "./state-rng.js";

function timestamp(state: GameState): GameState["campaign"] {
  return { ...state.campaign, updatedAt: new Date().toISOString() };
}

function parseDice(dice: string): { count: number; sides: number; bonus: number } {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(dice.trim());
  if (!match) return { count: 1, sides: 6, bonus: 0 };
  return {
    count: Math.max(1, Math.min(20, Number(match[1]))),
    sides: Math.max(2, Math.min(100, Number(match[2]))),
    bonus: Number(match[3] ?? 0),
  };
}

function rollDice(rng: ReturnType<typeof rngFromGameState>, dice: string, extra = 0): number {
  const parsed = parseDice(dice);
  let total = parsed.bonus + extra;
  for (let i = 0; i < parsed.count; i += 1) total += rng.roll(parsed.sides);
  return Math.max(1, total);
}

function battleLog(state: BattleState, line: string): BattleState {
  return { ...state, log: [...state.log.slice(-79), line] };
}

function activeUnit(battle: BattleState): BattleUnit | undefined {
  return battle.units.find((unit) => unit.id === battle.activeUnitId);
}

function appendAndSync(state: GameState, battle: BattleState): GameState {
  const playerUnit = battle.units.find((unit) => unit.kind === "player");
  const player = state.entities.player;
  const entities =
    player && playerUnit
      ? {
          ...state.entities,
          player: {
            ...player,
            hp: { ...player.hp, current: playerUnit.hp },
          },
        }
      : state.entities;
  return { ...state, battle, entities, campaign: timestamp(state) };
}

function arenaMap(state: GameState): LocalMap {
  const width = 13;
  const height = 9;
  const worldIndex = axialIndex(state.world.width, state.world.height, state.party.position);
  const terrain = state.world.terrain[worldIndex] ?? "grassland";
  const rough = ["hills", "mountains", "tundra", "snow"].includes(terrain);
  const forest = ["forest", "swamp"].includes(terrain);
  const dry = ["desert", "beach", "steppe"].includes(terrain);
  const tiles: string[] = Array.from({ length: width * height }, () => (dry ? "field" : "grass"));
  const set = (col: number, row: number, tile: string) => {
    if (col >= 0 && col < width && row >= 0 && row < height) tiles[row * width + col] = tile;
  };
  for (let col = 0; col < width; col += 1) {
    set(col, 0, "tree");
    set(col, height - 1, "tree");
  }
  for (let row = 0; row < height; row += 1) {
    set(0, row, "tree");
    set(width - 1, row, "tree");
  }
  for (let col = 1; col < width - 1; col += 1) set(col, 4, "road");
  if (forest) {
    set(4, 2, "tree");
    set(5, 2, "tree");
    set(8, 6, "tree");
    set(7, 6, "tree");
  }
  if (rough) {
    set(5, 2, "stone_wall");
    set(6, 2, "stone_wall");
    set(9, 6, "stone_wall");
  }
  set(9, 3, dry ? "field" : "grass");
  set(6, 6, "field");
  return {
    id: "core:battle_road",
    name: `Skirmish in the ${terrain}`,
    kind: "village",
    description: "A stretch of open ground and broken cover.",
    width,
    height,
    tiles,
    entrance: offsetToAxial({ col: 2, row: 4 }),
    buildings: [],
    exits: [],
    interactables: [],
    encounters: [],
    spots: {},
  };
}

function freeHexes(map: LocalMap, center: Hex, radius: number): Hex[] {
  const result: Hex[] = [];
  for (let r = 0; r <= radius; r += 1) {
    for (const hex of neighbors(center)) {
      if (distance(hex, center) <= r && localIsWalkable(map, hex)) result.push(hex);
    }
    if (result.length > 0) break;
  }
  if (result.length === 0) {
    for (let row = 0; row < map.height; row += 1) {
      for (let col = 0; col < map.width; col += 1) {
        const hex = offsetToAxial({ col, row });
        if (localIsWalkable(map, hex)) result.push(hex);
      }
    }
  }
  return result;
}

function enemyUnit(def: EnemyDefinition, index: number, position: Hex, initiative: number): BattleUnit {
  return {
    id: `enemy:${index}:${def.id}`,
    name: def.name,
    team: "enemy",
    kind: "enemy",
    hp: def.hp,
    maxHp: def.hp,
    ac: def.ac,
    speed: def.speed,
    initiative,
    position,
    moved: 0,
    actionUsed: false,
    bonusUsed: false,
    defeated: false,
    palette: def.palette,
    conditions: [],
  };
}

export interface StartBattleOptions {
  enemyIds: string[];
  source?: "travel" | "dungeon" | "scripted";
}

export function startBattle(state: GameState, options: StartBattleOptions): GameState | null {
  if (state.battle || options.enemyIds.length === 0) return null;
  const baseMap = state.local?.map ?? arenaMap(state);
  const map: LocalMap = state.local
    ? {
        ...baseMap,
        buildings: [],
        exits: [],
        interactables: [],
        encounters: [],
      }
    : baseMap;
  const player = state.entities.player;
  if (!player) return null;
  const rng = rngFromGameState(state);
  const playerPos = state.local?.position ?? offsetToAxial({ col: 2, row: 4 });
  const playerUnit: BattleUnit = {
    id: "battle:player",
    entityId: player.id,
    name: player.name,
    team: "party",
    kind: "player",
    hp: player.hp.current,
    maxHp: player.hp.max,
    ac: player.ac,
    speed: player.speed,
    initiative: rng.d20() + abilityModifier(player.attributes.dex),
    position: playerPos,
    moved: 0,
    actionUsed: false,
    bonusUsed: false,
    defeated: false,
    palette: player.appearance?.palette ?? "gold",
    conditions: [],
  };

  const occupied = new Set([hexKey(playerPos)]);
  const enemies: BattleUnit[] = [];
  const encounterHex = state.local?.map.encounters[0]?.hex ?? offsetToAxial({ col: 10, row: 4 });
  const candidates = freeHexes(map, encounterHex, 3);
  let candidateIndex = 0;
  for (const [index, enemyId] of options.enemyIds.entries()) {
    const def = getEnemy(enemyId);
    if (!def) continue;
    let position = candidates[candidateIndex] ?? offsetToAxial({ col: 10, row: 4 });
    while (occupied.has(hexKey(position)) && candidateIndex < candidates.length) {
      candidateIndex += 1;
      position = candidates[candidateIndex] ?? position;
    }
    occupied.add(hexKey(position));
    candidateIndex += 1;
    enemies.push(enemyUnit(def, index, position, rng.d20() + def.initiativeBonus));
  }
  if (enemies.length === 0) return null;

  const units = [playerUnit, ...enemies].sort((a, b) => b.initiative - a.initiative);
  const active = units[0]!;
  const order = units.map((unit) => ({
    entityId: unit.entityId ?? unit.id,
    initiative: unit.initiative,
    team: unit.team,
  }));
  const snapshot = rng.snapshot();
  let battle: BattleState = {
    id: `battle:${state.campaign.id}:${state.rng.cursor}`,
    arena: {
      width: map.width,
      height: map.height,
      terrain: map.tiles,
    },
    map,
    units,
    activeUnitId: active.id,
    status: "active",
    source: options.source ?? "travel",
    rewards: {
      gold: enemies.reduce(
        (sum, unit) => sum + (getEnemy(unit.id.split(":").slice(2).join(":"))?.gold ?? 0),
        0,
      ),
    },
    round: 1,
    turnIndex: 0,
    order,
    objective: "defeat",
    log: [
      `Battle begins: ${player.name} versus ${enemies.map((unit) => unit.name).join(", ")}.`,
      `${active.name} has the initiative (${active.initiative}).`,
    ],
  };
  battle = { ...battle, activeUnitId: active.id };
  const stateWithBattle: GameState = {
    ...state,
    battle,
    rng: { seed: snapshot.seed, state: snapshot.state, cursor: snapshot.cursor },
    campaign: timestamp(state),
  };
  return stateWithBattle;
}

function syncRng(state: GameState, rng: ReturnType<typeof rngFromGameState>): GameState {
  const snapshot = rng.snapshot();
  return {
    ...state,
    rng: { seed: snapshot.seed, state: snapshot.state, cursor: snapshot.cursor },
  };
}

function livingEnemies(battle: BattleState): BattleUnit[] {
  return battle.units.filter((unit) => unit.team === "enemy" && !unit.defeated);
}

function checkEnd(_state: GameState, battle: BattleState): BattleState {
  const player = battle.units.find((unit) => unit.kind === "player");
  const enemies = livingEnemies(battle);
  if (!player || player.hp <= 0) {
    return battleLog({ ...battle, status: "defeat" }, "The party falls. The road goes dark.");
  }
  if (enemies.length === 0) {
    return battleLog(
      { ...battle, status: "victory", rewards: { gold: battle.rewards.gold } },
      `Victory. ${battle.rewards.gold} gp can be recovered from the fallen.`,
    );
  }
  return battle;
}

function advanceTurn(battle: BattleState): BattleState {
  const alive = battle.units.filter((unit) => !unit.defeated);
  if (alive.length === 0) return battle;
  const currentIndex = battle.units.findIndex((unit) => unit.id === battle.activeUnitId);
  let nextIndex = (currentIndex + 1) % battle.units.length;
  let guard = 0;
  while (battle.units[nextIndex]?.defeated && guard < battle.units.length) {
    nextIndex = (nextIndex + 1) % battle.units.length;
    guard += 1;
  }
  const wrapped = nextIndex <= currentIndex;
  const next = battle.units[nextIndex];
  if (!next) return battle;
  const units = battle.units.map((unit) =>
    unit.id === next.id
      ? {
          ...unit,
          moved: 0,
          actionUsed: false,
          bonusUsed: false,
          conditions:
            unit.kind === "player"
              ? unit.conditions.filter((entry) => entry !== "shielded")
              : unit.conditions,
        }
      : unit,
  );
  return {
    ...battle,
    units,
    activeUnitId: next.id,
    round: wrapped ? battle.round + 1 : battle.round,
    turnIndex: nextIndex,
    log: [...battle.log.slice(-79), `${next.name}'s turn.`],
  };
}

function activePlayer(battle: BattleState): BattleUnit | undefined {
  const unit = activeUnit(battle);
  return unit?.kind === "player" ? unit : undefined;
}

export function battleMove(state: GameState, to: Hex): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const unit = activePlayer(battle);
  if (!unit) return null;
  const map = battle.map;
  if (!map) return null;
  const occupied = new Set(
    battle.units
      .filter((entry) => !entry.defeated && entry.id !== unit.id)
      .map((entry) => hexKey(entry.position)),
  );
  if (occupied.has(hexKey(to)) || !localIsWalkable(map, to)) return null;
  const route = findPath(unit.position, to, (hex) => (localIsWalkable(map, hex) ? 1 : null));
  if (!route) return null;
  const remaining = unit.speed - unit.moved;
  if (route.path.length === 0 || route.path.length > remaining) return null;
  const units = battle.units.map((entry) =>
    entry.id === unit.id ? { ...entry, position: to, moved: entry.moved + route.path.length } : entry,
  );
  const nextBattle = battleLog(
    { ...battle, units },
    `${unit.name} moves ${route.path.length} hex${route.path.length === 1 ? "" : "es"}.`,
  );
  return appendAndSync(state, nextBattle);
}

export function battleAttack(state: GameState, targetId: string): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const attacking = activePlayer(battle);
  const target = battle.units.find((unit) => unit.id === targetId);
  if (!attacking || !target || target.defeated || target.team === "party") return null;
  if (attacking.actionUsed) return null;
  if (distance(attacking.position, target.position) > 1) return null;
  const rng = rngFromGameState(state);
  const bonus =
    proficiencyBonus(state.entities.player?.level ?? 1) +
    abilityModifier(state.entities.player?.attributes.str ?? 10);
  const roll = rng.d20();
  const total = roll + bonus;
  const crit = roll === 20;
  const player = state.entities.player;
  const weapon = player?.equipment.mainHand ? getItem(player.equipment.mainHand) : undefined;
  const dice = String(weapon?.stats.damage ?? "1d4");
  const damage =
    total >= target.ac
      ? rollDice(rng, dice, abilityModifier(player?.attributes.str ?? 10)) * (crit ? 2 : 1)
      : 0;
  const hp = Math.max(0, target.hp - damage);
  const defeated = hp === 0;
  const units = battle.units.map((unit) =>
    unit.id === target.id
      ? { ...unit, hp, defeated }
      : unit.id === attacking.id
        ? { ...unit, actionUsed: true }
        : unit,
  );
  let next: BattleState = {
    ...battle,
    units,
    log: [
      ...battle.log.slice(-78),
      `${attacking.name} attacks ${target.name}: d20 ${roll} + ${bonus} = ${total} vs AC ${target.ac}${crit ? " (critical!)" : ""}.`,
      ...(damage > 0
        ? [`${target.name} takes ${damage} damage (${hp}/${target.maxHp} hp).`]
        : ["The attack misses."]),
    ],
  };
  next = checkEnd(state, next);
  const synced = syncRng({ ...state, rng: state.rng }, rng);
  return appendAndSync(synced, next);
}

export function battleUseAbility(state: GameState, abilityId: string, targetId?: string): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const actor = activePlayer(battle);
  const player = state.entities.player;
  const ability = getAbility(abilityId);
  if (!actor || !player || !ability || actor.actionUsed) return null;
  if (player.focus.current < ability.cost) return null;
  const rng = rngFromGameState(state);
  const target = targetId ? battle.units.find((unit) => unit.id === targetId) : undefined;
  const needsTarget = ability.targeting !== "self";
  if (needsTarget && (!target || target.defeated || target.team === "party")) return null;
  if (needsTarget && distance(actor.position, target!.position) > ability.rangeHexes) return null;
  if (needsTarget && ability.rangeHexes > 1 && battle.map) {
    if (!lineOfSight(actor.position, target!.position, (hex) => !localIsWalkable(battle.map!, hex))) {
      return null;
    }
  }

  let units = battle.units;
  const log = [...battle.log.slice(-78)];
  let focusCost = ability.cost;

  if (ability.id === "core:power_strike" || ability.id === "core:sneak_attack") {
    const hit =
      rng.d20() + proficiencyBonus(player.level) + abilityModifier(player.attributes.str) >= target!.ac;
    const weapon = player.equipment.mainHand ? getItem(player.equipment.mainHand) : undefined;
    const extra = ability.id === "core:power_strike" ? "1d6" : "1d6";
    const damage = hit
      ? rollDice(rng, String(weapon?.stats.damage ?? "1d4"), abilityModifier(player.attributes.str)) +
        rollDice(rng, extra)
      : 0;
    const hp = Math.max(0, target!.hp - damage);
    units = units.map((unit) =>
      unit.id === target!.id
        ? { ...unit, hp, defeated: hp === 0 }
        : unit.id === actor.id
          ? { ...unit, actionUsed: true }
          : unit,
    );
    log.push(`${actor.name} uses ${ability.name} on ${target!.name}: ${hit ? `${damage} damage` : "miss"}.`);
  } else if (ability.id === "core:firebolt") {
    const hit =
      rng.d20() + proficiencyBonus(player.level) + abilityModifier(player.attributes.int) >= target!.ac;
    const damage = hit ? rollDice(rng, "1d10") : 0;
    const hp = Math.max(0, target!.hp - damage);
    units = units.map((unit) =>
      unit.id === target!.id
        ? { ...unit, hp, defeated: hp === 0 }
        : unit.id === actor.id
          ? { ...unit, actionUsed: true }
          : unit,
    );
    log.push(`${actor.name} casts ${ability.name}: ${hit ? `${damage} fire damage` : "miss"}.`);
  } else if (ability.id === "core:shield") {
    units = units.map((unit) =>
      unit.id === actor.id
        ? { ...unit, actionUsed: true, conditions: [...new Set([...unit.conditions, "shielded"])] }
        : unit,
    );
    log.push(`${actor.name} raises a shield of force (+5 AC).`);
  } else if (ability.id === "core:second_wind") {
    const heal = rollDice(rng, "1d10", player.level);
    const hp = Math.min(actor.maxHp, actor.hp + heal);
    units = units.map((unit) => (unit.id === actor.id ? { ...unit, hp, actionUsed: true } : unit));
    log.push(`${actor.name} recovers ${heal} hit points (${hp}/${actor.maxHp} hp).`);
  } else if (ability.id === "core:cunning_action") {
    units = units.map((unit) => (unit.id === actor.id ? { ...unit, moved: 0, actionUsed: true } : unit));
    focusCost = ability.cost;
    log.push(`${actor.name} repositions with ${ability.name}.`);
  } else {
    return null;
  }

  const nextPlayer: Entity = {
    ...player,
    focus: { ...player.focus, current: Math.max(0, player.focus.current - focusCost) },
  };
  let next: BattleState = { ...battle, units, log };
  next = checkEnd({ ...state, entities: { ...state.entities, player: nextPlayer } }, next);
  const synced = syncRng({ ...state, entities: { ...state.entities, player: nextPlayer } }, rng);
  return appendAndSync(synced, next);
}

export function endBattleTurn(state: GameState): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const next = checkEnd(state, advanceTurn(battle));
  return appendAndSync(state, next);
}

export function battleEnemyTurn(state: GameState): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const enemy = activeUnit(battle);
  if (enemy?.team !== "enemy" || enemy.defeated) return null;
  const player = battle.units.find((unit) => unit.kind === "player");
  if (!player || player.defeated) return null;
  const rng = rngFromGameState(state);
  let units = battle.units;
  const log = [...battle.log.slice(-78)];
  let position = enemy.position;
  let actionUsed = enemy.actionUsed;
  const dist = distance(position, player.position);
  if (dist > 1) {
    const map = battle.map;
    if (map) {
      const route = findPath(position, player.position, (hex) => (localIsWalkable(map, hex) ? 1 : null));
      const steps = route?.path.slice(0, Math.max(0, enemy.speed - enemy.moved)) ?? [];
      for (const step of steps) {
        if (distance(step, player.position) <= 1) break;
        position = step;
      }
      const moved = distance(enemy.position, position);
      units = units.map((unit) =>
        unit.id === enemy.id ? { ...unit, position, moved: unit.moved + moved } : unit,
      );
      if (moved > 0) log.push(`${enemy.name} closes ${moved} hex${moved === 1 ? "" : "es"}.`);
    }
  }
  if (distance(position, player.position) <= 1 && !actionUsed) {
    const def = getEnemy(enemy.id.split(":").slice(2).join(":"));
    const bonus = def?.attackBonus ?? 2;
    const dice = def?.damageDice ?? "1d6";
    const damageBonus = def?.damageBonus ?? 0;
    const roll = rng.d20();
    const total = roll + bonus;
    const targetAc = player.ac + (player.conditions.includes("shielded") ? 5 : 0);
    const hit = total >= targetAc;
    const damage = hit ? rollDice(rng, dice, damageBonus) : 0;
    const hp = Math.max(0, player.hp - damage);
    actionUsed = true;
    units = units.map((unit) =>
      unit.id === player.id
        ? { ...unit, hp, defeated: hp === 0 }
        : unit.id === enemy.id
          ? { ...unit, actionUsed }
          : unit,
    );
    log.push(
      `${enemy.name} attacks ${player.name}: d20 ${roll} + ${bonus} = ${total} vs AC ${targetAc}. ${
        hit ? `${damage} damage (${hp}/${player.maxHp} hp).` : "Miss."
      }`,
    );
  } else {
    units = units.map((unit) => (unit.id === enemy.id ? { ...unit, actionUsed: true } : unit));
    log.push(`${enemy.name} holds position.`);
  }
  let next: BattleState = { ...battle, units, log };
  next = checkEnd(state, next);
  const synced = syncRng(state, rng);
  if (next.status !== "active") return appendAndSync(synced, next);
  return appendAndSync(synced, advanceTurn(next));
}

export function retreatBattle(state: GameState): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  return appendAndSync(
    state,
    battleLog({ ...battle, status: "retreated" }, "The party withdraws from the fight."),
  );
}

export function finishBattle(state: GameState): GameState | null {
  const battle = state.battle;
  if (!battle) return null;
  const playerUnit = battle.units.find((unit) => unit.kind === "player");
  const player = state.entities.player;
  let next: GameState = { ...state, battle: undefined, campaign: timestamp(state) };
  if (player && playerUnit) {
    const gold =
      battle.status === "victory"
        ? state.party.gold + battle.rewards.gold
        : battle.status === "defeat"
          ? Math.max(0, state.party.gold - 10)
          : state.party.gold;
    next = {
      ...next,
      party: { ...state.party, gold },
      entities: {
        ...state.entities,
        player: {
          ...player,
          hp: {
            ...player.hp,
            current: battle.status === "defeat" ? Math.max(1, playerUnit.hp || 1) : playerUnit.hp,
          },
        },
      },
    };
  }
  return next;
}

export function battleEnemiesForEncounter(encounterId: string): string[] {
  if (encounterId.includes("crypt")) return ["core:crypt_shade", "core:crypt_shade"];
  if (encounterId.includes("road")) return ["core:bandit", "core:wolf"];
  return ["core:bandit"];
}

export function battleUnitAt(battle: BattleState, hex: Hex): BattleUnit | undefined {
  return battle.units.find(
    (unit) => !unit.defeated && unit.position.q === hex.q && unit.position.r === hex.r,
  );
}

export function battleReachable(battle: BattleState): Set<string> {
  const map = battle.map;
  const unit = activeUnit(battle);
  if (!map || !unit || unit.kind !== "player") return new Set();
  const result = new Set<string>();
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const hex = offsetToAxial({ col, row });
      const route = findPath(unit.position, hex, (h) => (localIsWalkable(map, h) ? 1 : null));
      if (route && route.path.length <= unit.speed - unit.moved) result.add(hexKey(hex));
    }
  }
  return result;
}

export function battleMapTile(map: LocalMap, hex: Hex): string {
  const index = axialIndex(map.width, map.height, hex);
  return index >= 0 ? (map.tiles[index] ?? "grass") : "grass";
}
