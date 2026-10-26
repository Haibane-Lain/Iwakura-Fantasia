import { getAbility, getClass, getCondition, getEnemy, getItem } from "@iwakura/content";
import type {
  Ability,
  AbilityEffect,
  BattleState,
  BattleUnit,
  DamageType,
  EnemyDefinition,
  Entity,
  GameState,
  Hex,
  LocalMap,
} from "@iwakura/contracts";
import { abilityModifier, attackBonus, damageBonus, initiativeBonus, proficiencyBonus } from "./character.js";
import { axialIndex, offsetToAxial } from "./grid.js";
import { distance, findPath, hexKey, lineOfSight, neighbors } from "./hex.js";
import { localIsWalkable } from "./local.js";
import { awardMilestone } from "./progression.js";
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

function conditionValue(
  unit: BattleUnit,
  key: "acBonus" | "attackBonus" | "saveBonus" | "damageBonus" | "damageTakenBonus",
): number {
  return unit.conditions.reduce((sum, id) => {
    const condition = getCondition(id);
    return sum + (condition?.[key] ?? 0);
  }, 0);
}

function withCondition(unit: BattleUnit, conditionId: string, duration: number): BattleUnit {
  const existing = unit.conditionTurns[conditionId] ?? 0;
  return {
    ...unit,
    conditions: [...new Set([...unit.conditions, conditionId])],
    conditionTurns: { ...unit.conditionTurns, [conditionId]: Math.max(existing, duration) },
  };
}

function applyDamage(unit: BattleUnit, amount: number, damageType: DamageType): BattleUnit {
  const resisted =
    unit.resistances.includes(damageType) ||
    (unit.resistances.includes("physical") &&
      ["physical", "slashing", "piercing", "bludgeoning"].includes(damageType));
  const damage = Math.max(0, resisted ? Math.floor(amount / 2) : amount);
  const absorbed = Math.min(unit.tempHp, damage);
  const hp = Math.max(0, unit.hp - (damage - absorbed));
  return {
    ...unit,
    tempHp: unit.tempHp - absorbed,
    hp,
    defeated: hp === 0,
  };
}

function conditionLabel(unit: BattleUnit): string {
  return unit.conditions.length > 0 ? ` [${unit.conditions.join(", ")}]` : "";
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
    set(4, 3, "high_ground");
    set(8, 3, "high_ground");
    set(4, 5, "high_ground");
    set(8, 5, "high_ground");
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
    conditionTurns: {},
    tempHp: 0,
    resistances: [],
  };
}

export interface StartBattleOptions {
  enemyIds: string[];
  source?: "travel" | "dungeon" | "scripted";
  travelGroupId?: string;
  enemyPositions?: Hex[];
}

export function startBattle(state: GameState, options: StartBattleOptions): GameState | null {
  if (state.battle || options.enemyIds.length === 0) return null;
  // A local map is the most specific battlefield. Travel state can still be
  // present when a dungeon encounter starts after fast travel, so check the
  // local map first instead of silently fighting on the wilderness field.
  const baseMap = state.local?.map ?? state.travel?.map ?? arenaMap(state);
  const map: LocalMap =
    state.travel || state.local
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
  const playerPos = state.local?.position ?? state.travel?.position ?? offsetToAxial({ col: 2, row: 4 });
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
    initiative: rng.d20() + initiativeBonus(player),
    position: playerPos,
    moved: 0,
    actionUsed: false,
    bonusUsed: false,
    defeated: false,
    palette: player.appearance?.palette ?? "gold",
    conditions: [],
    conditionTurns: {},
    tempHp: 0,
    resistances: player.progression.resistances,
  };

  const occupied = new Set([hexKey(playerPos)]);
  const enemies: BattleUnit[] = [];
  const encounterHex =
    options.enemyPositions?.[0] ?? state.local?.map.encounters[0]?.hex ?? offsetToAxial({ col: 10, row: 4 });
  const candidates = freeHexes(map, encounterHex, 3);
  let candidateIndex = 0;
  for (const [index, enemyId] of options.enemyIds.entries()) {
    const def = getEnemy(enemyId);
    if (!def) continue;
    const preferred = options.enemyPositions?.[index];
    let position =
      preferred && localIsWalkable(map, preferred) && !occupied.has(hexKey(preferred))
        ? preferred
        : (candidates[candidateIndex] ?? offsetToAxial({ col: 10, row: 4 }));
    while (occupied.has(hexKey(position)) && candidateIndex < candidates.length) {
      candidateIndex += 1;
      position = candidates[candidateIndex] ?? position;
    }
    occupied.add(hexKey(position));
    candidateIndex += 1;
    enemies.push(enemyUnit(def, index, position, rng.d20() + def.initiativeBonus));
  }
  if (enemies.length === 0) return null;

  const companionCandidates = freeHexes(map, playerPos, 2).filter((hex) => !occupied.has(hexKey(hex)));
  let companionIndex = 0;
  const companions: BattleUnit[] = [];
  for (const memberId of state.party.memberIds) {
    if (memberId === player.id) continue;
    const entity = state.entities[memberId];
    if (!entity?.companion) continue;
    const position = companionCandidates[companionIndex] ?? playerPos;
    companionIndex += 1;
    occupied.add(hexKey(position));
    companions.push({
      id: `companion:${entity.id}`,
      entityId: entity.id,
      name: entity.name,
      team: "party",
      kind: "companion",
      hp: entity.hp.current,
      maxHp: entity.hp.max,
      ac: entity.ac,
      speed: entity.speed,
      initiative: rng.d20() + initiativeBonus(entity),
      position,
      moved: 0,
      actionUsed: false,
      bonusUsed: false,
      defeated: false,
      palette: entity.appearance?.palette ?? "moss",
      conditions: [],
      conditionTurns: {},
      tempHp: 0,
      resistances: entity.progression.resistances,
    });
  }

  const units = [playerUnit, ...companions, ...enemies].sort((a, b) => b.initiative - a.initiative);
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
    ...(options.travelGroupId ? { travelGroupId: options.travelGroupId } : {}),
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
  const units = battle.units.map((unit) => {
    if (unit.id !== next.id) return unit;
    const conditionTurns: Record<string, number> = {};
    for (const [id, turns] of Object.entries(unit.conditionTurns)) {
      if (turns > 1) conditionTurns[id] = turns - 1;
    }
    return {
      ...unit,
      moved: 0,
      actionUsed: false,
      bonusUsed: false,
      conditions: unit.conditions.filter((id) => (conditionTurns[id] ?? 0) > 0),
      conditionTurns,
    };
  });
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

function coverBonus(battle: BattleState, unit: BattleUnit): number {
  const map = battle.map;
  if (!map) return 0;
  return neighbors(unit.position).some((hex) => {
    const tile = battleMapTile(map, hex);
    return tile === "tree" || tile === "stone_wall" || tile === "crate";
  })
    ? 2
    : 0;
}

function highGroundBonus(battle: BattleState, unit: BattleUnit): number {
  const map = battle.map;
  return map && battleMapTile(map, unit.position) === "high_ground" ? 1 : 0;
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
  const player = state.entities.player;
  if (!player) return null;
  const bonus =
    attackBonus(player, "str") +
    highGroundBonus(battle, attacking) +
    conditionValue(attacking, "attackBonus");
  const roll = rng.d20();
  const total = roll + bonus;
  const crit = roll === 20;
  const weapon = player?.equipment.mainHand ? getItem(player.equipment.mainHand) : undefined;
  const dice = String(weapon?.stats.damage ?? "1d4");
  const damageType = String(weapon?.stats.damageType ?? "physical") as DamageType;
  const targetAc = target.ac + coverBonus(battle, target) + conditionValue(target, "acBonus");
  const rawDamage =
    total >= targetAc
      ? rollDice(rng, dice, abilityModifier(player?.attributes.str ?? 10)) +
        damageBonus(player) +
        conditionValue(attacking, "damageBonus") +
        conditionValue(target, "damageTakenBonus")
      : 0;
  const damagedTarget = applyDamage(target, rawDamage * (crit ? 2 : 1), damageType);
  const units = battle.units.map((unit) =>
    unit.id === target.id ? damagedTarget : unit.id === attacking.id ? { ...unit, actionUsed: true } : unit,
  );
  let next: BattleState = {
    ...battle,
    units,
    log: [
      ...battle.log.slice(-78),
      `${attacking.name} attacks ${target.name}: d20 ${roll} + ${bonus} = ${total} vs AC ${targetAc}${
        coverBonus(battle, target) > 0 ? " (cover)" : ""
      }${crit ? " (critical!)" : ""}.`,
      ...(rawDamage > 0
        ? [
            `${target.name} takes ${rawDamage * (crit ? 2 : 1)} damage (${damagedTarget.hp}/${target.maxHp} hp)${conditionLabel(target)}.`,
          ]
        : ["The attack misses."]),
    ],
  };
  next = checkEnd(state, next);
  const synced = syncRng({ ...state, rng: state.rng }, rng);
  return appendAndSync(synced, next);
}

function abilityAttribute(ability: Ability, player: Entity): keyof Entity["attributes"] {
  if (ability.attribute) return ability.attribute;
  const characterClass = player.classId ? getClass(player.classId) : undefined;
  return characterClass?.spellAttribute ?? characterClass?.primaryAttributes[0] ?? "str";
}

function abilityTarget(
  battle: BattleState,
  ability: Ability,
  actor: BattleUnit,
  targetId?: string,
): BattleUnit | null {
  if (ability.targetType === "self" || ability.targeting === "self") return actor;
  const target = targetId ? battle.units.find((unit) => unit.id === targetId) : undefined;
  if (!target || target.defeated) return null;
  if (ability.targetType === "enemy" && target.team !== "enemy") return null;
  if (ability.targetType === "ally" && target.team !== "party") return null;
  return target;
}

export function battleUseAbility(state: GameState, abilityId: string, targetId?: string): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const actor = activePlayer(battle);
  const player = state.entities.player;
  const ability = getAbility(abilityId);
  if (!actor || !player || !ability) return null;
  if (ability.action === "bonus" ? actor.bonusUsed : actor.actionUsed) return null;
  if (player.focus.current < ability.cost) return null;

  const target = abilityTarget(battle, ability, actor, targetId);
  if (ability.targeting !== "self" && !target) return null;
  if (
    target &&
    ability.targetType !== "self" &&
    distance(actor.position, target.position) > ability.rangeHexes
  ) {
    return null;
  }
  if (target && ability.rangeHexes > 1 && battle.map && distance(actor.position, target.position) > 1) {
    if (!lineOfSight(actor.position, target.position, (hex) => !localIsWalkable(battle.map!, hex))) {
      return null;
    }
  }

  const rng = rngFromGameState(state);
  const attribute = abilityAttribute(ability, player);
  const roll = ability.attack ? rng.d20() : 20;
  const attackTotal =
    roll +
    attackBonus(player, attribute) +
    highGroundBonus(battle, actor) +
    conditionValue(actor, "attackBonus");
  const targetAc = target ? target.ac + coverBonus(battle, target) + conditionValue(target, "acBonus") : 0;
  const hit = !ability.attack || roll === 20 || attackTotal >= targetAc;
  const crit = ability.attack && roll === 20;

  let units = battle.units;
  const log = [...battle.log.slice(-78)];
  let focus = player.focus.current;
  const modify = (id: string, update: (unit: BattleUnit) => BattleUnit) => {
    units = units.map((unit) => (unit.id === id ? update(unit) : unit));
  };
  const current = (id: string) => units.find((unit) => unit.id === id);

  if (ability.attack && target) {
    log.push(
      `${actor.name} uses ${ability.name} on ${target.name}: d20 ${roll} + ${attackTotal - roll} = ${attackTotal} vs AC ${targetAc}${crit ? " (critical!)" : hit ? "" : " (miss)"}.`,
    );
  } else {
    log.push(`${actor.name} uses ${ability.name}.`);
  }

  for (const effect of ability.effects as AbilityEffect[]) {
    const targetsTarget = effect.kind !== "movement" && effect.kind !== "resource";
    if (ability.attack && !hit && targetsTarget) continue;
    switch (effect.kind) {
      case "damage": {
        if (!target) break;
        const weapon = player.equipment.mainHand ? getItem(player.equipment.mainHand) : undefined;
        const dice = effect.dice ?? String(weapon?.stats.damage ?? "1d4");
        const damageType =
          effect.damageType ?? (weapon?.stats.damageType as DamageType | undefined) ?? "physical";
        const extra =
          (effect.addAttribute ? abilityModifier(player.attributes[effect.addAttribute]) : 0) +
          effect.bonus +
          (effect.addLevel ? player.level : 0) +
          (effect.scaling === "level"
            ? player.level
            : effect.scaling === "level_div_2"
              ? Math.floor(player.level / 2)
              : 0) +
          damageBonus(player) +
          conditionValue(actor, "damageBonus") +
          conditionValue(target, "damageTakenBonus");
        const amount = rollDice(rng, dice, extra) * (crit ? 2 : 1);
        modify(target.id, (unit) => applyDamage(unit, amount, damageType));
        log.push(
          `${target.name} takes ${amount} ${damageType} damage (${current(target.id)?.hp ?? 0}/${target.maxHp} hp)${conditionLabel(target)}.`,
        );
        break;
      }
      case "heal": {
        const targetUnit = effect.target === "self" ? actor : target;
        if (!targetUnit) break;
        const amount = rollDice(
          rng,
          effect.dice,
          (effect.addAttribute ? abilityModifier(player.attributes[effect.addAttribute]) : 0) +
            effect.bonus +
            (effect.addLevel ? player.level : 0),
        );
        modify(targetUnit.id, (unit) => ({
          ...unit,
          hp: Math.min(unit.maxHp, unit.hp + amount),
          defeated: false,
        }));
        log.push(`${targetUnit.name} recovers ${amount} hit points.`);
        break;
      }
      case "temp_hp": {
        const targetUnit = effect.target === "self" ? actor : target;
        if (!targetUnit) break;
        const amount =
          effect.value ??
          rollDice(
            rng,
            effect.dice ?? "1d4",
            effect.addAttribute ? abilityModifier(player.attributes[effect.addAttribute]) : 0,
          );
        modify(targetUnit.id, (unit) => ({ ...unit, tempHp: Math.max(unit.tempHp, amount) }));
        log.push(`${targetUnit.name} gains ${amount} temporary hit points.`);
        break;
      }
      case "condition": {
        const targetUnit = effect.target === "self" ? actor : target;
        if (!targetUnit) break;
        modify(targetUnit.id, (unit) => withCondition(unit, effect.conditionId, effect.duration));
        log.push(`${targetUnit.name} gains ${getCondition(effect.conditionId)?.name ?? effect.conditionId}.`);
        break;
      }
      case "movement":
        modify(actor.id, (unit) => ({ ...unit, moved: 0 }));
        log.push(`${actor.name} repositions.`);
        break;
      case "resource":
        if (effect.resource === "focus") {
          focus = Math.min(player.focus.max, focus + effect.value);
          log.push(`${actor.name} recovers ${effect.value} focus.`);
        } else {
          modify(actor.id, (unit) => ({
            ...unit,
            hp: Math.min(unit.maxHp, unit.hp + effect.value),
            defeated: false,
          }));
          log.push(`${actor.name} recovers ${effect.value} hit points.`);
        }
        break;
      case "cleanse": {
        const targetUnit = effect.target === "self" ? actor : target;
        if (!targetUnit) break;
        modify(targetUnit.id, (unit) => ({ ...unit, conditions: [], conditionTurns: {} }));
        log.push(`${targetUnit.name} is cleansed.`);
        break;
      }
    }
  }

  const usesBonus = ability.action === "bonus";
  modify(actor.id, (unit) =>
    usesBonus
      ? { ...unit, bonusUsed: true }
      : ability.action === "free"
        ? unit
        : { ...unit, actionUsed: true },
  );
  focus = Math.max(0, focus - ability.cost);

  const nextPlayer: Entity = {
    ...player,
    focus: { ...player.focus, current: focus },
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
  const actionUsed = enemy.actionUsed;
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
    const bonus =
      (def?.attackBonus ?? 2) + highGroundBonus(battle, enemy) + conditionValue(enemy, "attackBonus");
    const dice = def?.damageDice ?? "1d6";
    const roll = rng.d20();
    const total = roll + bonus;
    const targetAc = player.ac + conditionValue(player, "acBonus") + coverBonus(battle, player);
    const hit = total >= targetAc;
    const damage = hit
      ? rollDice(
          rng,
          dice,
          (def?.damageBonus ?? 0) +
            conditionValue(enemy, "damageBonus") +
            conditionValue(player, "damageTakenBonus"),
        )
      : 0;
    const damagedPlayer = applyDamage(player, damage, "physical");

    units = units.map((unit) =>
      unit.id === player.id ? damagedPlayer : unit.id === enemy.id ? { ...unit, actionUsed } : unit,
    );
    log.push(
      `${enemy.name} attacks ${player.name}: d20 ${roll} + ${bonus} = ${total} vs AC ${targetAc}. ${
        hit ? `${damage} damage (${damagedPlayer.hp}/${player.maxHp} hp).` : "Miss."
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

export function battleCompanionTurn(state: GameState): GameState | null {
  const battle = state.battle;
  if (battle?.status !== "active") return null;
  const companion = activeUnit(battle);
  if (companion?.kind !== "companion" || companion.defeated) return null;
  const enemies = livingEnemies(battle);
  if (enemies.length === 0) return null;
  const target = enemies.sort(
    (a, b) => distance(companion.position, a.position) - distance(companion.position, b.position),
  )[0]!;
  const rng = rngFromGameState(state);
  const map = battle.map;
  let units = battle.units;
  let position = companion.position;
  const log = [...battle.log.slice(-78)];
  if (distance(position, target.position) > 1 && map) {
    const route = findPath(position, target.position, (hex) => (localIsWalkable(map, hex) ? 1 : null));
    const steps = route?.path.slice(0, companion.speed) ?? [];
    for (const step of steps) {
      if (distance(step, target.position) <= 1) break;
      position = step;
    }
    const moved = distance(companion.position, position);
    units = units.map((unit) =>
      unit.id === companion.id ? { ...unit, position, moved: unit.moved + moved } : unit,
    );
    if (moved > 0)
      log.push(`${companion.name} moves to support ${state.entities.player?.name ?? "the party"}.`);
  }

  if (distance(position, target.position) <= 1) {
    const entity = companion.entityId ? state.entities[companion.entityId] : undefined;
    const weapon = entity?.equipment.mainHand ? getItem(entity.equipment.mainHand) : undefined;
    const bonus = entity ? attackBonus(entity, "str") : proficiencyBonus(1) + abilityModifier(10);
    const roll = rng.d20();
    const total =
      roll + bonus + highGroundBonus(battle, companion) + conditionValue(companion, "attackBonus");
    const targetAc = target.ac + coverBonus(battle, target) + conditionValue(target, "acBonus");
    const hit = total >= targetAc;
    const damageType = String(weapon?.stats.damageType ?? "physical") as DamageType;
    const damage = hit
      ? rollDice(
          rng,
          String(weapon?.stats.damage ?? "1d6"),
          abilityModifier(entity?.attributes.str ?? 10) +
            (entity ? damageBonus(entity) : 0) +
            conditionValue(companion, "damageBonus") +
            conditionValue(target, "damageTakenBonus"),
        )
      : 0;
    const damagedTarget = applyDamage(target, damage, damageType);

    units = units.map((unit) =>
      unit.id === target.id ? damagedTarget : unit.id === companion.id ? { ...unit, actionUsed: true } : unit,
    );
    log.push(
      `${companion.name} attacks ${target.name}: d20 ${roll} + ${bonus} = ${total} vs AC ${targetAc}. ${
        hit ? `${damage} damage (${damagedTarget.hp}/${target.maxHp} hp).` : "Miss."
      }`,
    );
  } else {
    log.push(`${companion.name} closes in.`);
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
  const entities = { ...state.entities };
  for (const unit of battle.units) {
    if (unit.team !== "party" || !unit.entityId) continue;
    const entity = entities[unit.entityId];
    if (!entity) continue;
    entities[unit.entityId] = {
      ...entity,
      hp: {
        ...entity.hp,
        current: battle.status === "defeat" && unit.kind === "player" ? Math.max(1, unit.hp || 1) : unit.hp,
      },
    };
  }
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
      entities,
    };
  } else {
    next = { ...next, entities };
  }

  if (battle.travelGroupId && next.travel) {
    const groupId = battle.travelGroupId;
    const travel = next.travel;
    const clearedKey = `travel.cleared.${travel.worldHex.q},${travel.worldHex.r}`;
    const cleared = Array.isArray(next.flags[clearedKey])
      ? (next.flags[clearedKey] as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : [];
    next = {
      ...next,
      travel: {
        ...travel,
        enemies: travel.enemies.filter((group) => group.id !== groupId),
        clearedGroupIds: [...new Set([...travel.clearedGroupIds, groupId])],
        ...(battle.status === "defeat" ? { position: travel.map.entrance } : {}),
      },
      flags: {
        ...next.flags,
        [clearedKey]: [...new Set([...cleared, groupId])],
      },
    };
  }
  if (battle.status === "victory") {
    next = awardMilestone(next, 1, "Won a fight on the road.");
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
