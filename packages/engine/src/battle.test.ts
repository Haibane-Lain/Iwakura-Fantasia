import type { CharacterBuild, GameState } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import {
  battleAttack,
  battleCompanionTurn,
  battleEnemiesForEncounter,
  battleEnemyTurn,
  battleMove,
  battleReachable,
  battleUseAbility,
  finishBattle,
  retreatBattle,
  startBattle,
} from "./battle.js";
import { defaultCharacterBuild } from "./character.js";
import { enterLocalMap } from "./local.js";
import { recruitCompanion } from "./social.js";
import { createGameState } from "./world.js";
import { generateWorld } from "./worldgen.js";

function makeState(build?: CharacterBuild): GameState {
  return createGameState({
    world: generateWorld({ source: "handcrafted", seed: "core:redford_reach" }).world,
    settings: {
      worldSource: "handcrafted",
      seed: "core:redford_reach",
      genParams: {
        width: 64,
        height: 64,
        seaLevel: 0.42,
        climate: "varied",
        magicLevel: "standard",
        danger: "normal",
        settlementDensity: 0.5,
      },
      difficulty: "normal",
      contentRating: "teen",
      aiEnabled: true,
    },
    campaignId: "test",
    campaignName: "Test",
    build,
  });
}

function cryptState(): GameState {
  return enterLocalMap(makeState(), "core:redford")!.state;
}

function forcePlayerTurn(state: GameState): GameState {
  const battle = state.battle!;
  const player = battle.units.find((unit) => unit.kind === "player")!;
  return {
    ...state,
    battle: {
      ...battle,
      activeUnitId: player.id,
      units: battle.units.map((unit) =>
        unit.id === player.id ? { ...unit, actionUsed: false, bonusUsed: false, moved: 0 } : unit,
      ),
    },
  };
}

describe("battle engine", () => {
  it("starts a battle from a local map and creates units", () => {
    const state = startBattle(cryptState(), { enemyIds: ["core:crypt_shade", "core:crypt_shade"] });
    expect(state).not.toBeNull();
    const battle = state!.battle!;
    expect(battle.units.length).toBe(3);
    expect(battle.map?.kind).toBe("town");
    expect(battle.status).toBe("active");
    expect(battle.log.length).toBeGreaterThan(0);
    expect(battle.order.length).toBe(3);
    expect(battle.activeUnitId).toBeTruthy();
  });

  it("rolls initiative and exposes the active unit's movement", () => {
    let state = startBattle(cryptState(), { enemyIds: ["core:bandit"] })!;
    state = forcePlayerTurn(state);
    const reachable = battleReachable(state.battle!);
    expect(reachable.size).toBeGreaterThan(1);
    const player = state.battle!.units.find((unit) => unit.kind === "player")!;
    const target = [...reachable]
      .map((key) => {
        const [q, r] = key.split(",").map(Number);
        return { q: q!, r: r! };
      })
      .find((hex) => hex.q !== player.position.q || hex.r !== player.position.r)!;
    const moved = battleMove(state, target);
    expect(moved).not.toBeNull();
    expect(moved!.battle!.units.find((unit) => unit.id === player.id)?.position).toEqual(target);
  });

  it("resolves a player attack, victory, and rewards", () => {
    let state = startBattle(cryptState(), { enemyIds: ["core:bandit"] })!;
    state = forcePlayerTurn(state);
    const battle = state.battle!;
    const player = battle.units.find((unit) => unit.kind === "player")!;
    const enemy = battle.units.find((unit) => unit.team === "enemy")!;
    const targetHex = { q: player.position.q + 1, r: player.position.r };
    state = {
      ...state,
      battle: {
        ...battle,
        units: battle.units.map((unit) =>
          unit.id === enemy.id ? { ...unit, position: targetHex, hp: 1, maxHp: 1, ac: 1 } : unit,
        ),
      },
    };
    const attacked = battleAttack(state, enemy.id);
    expect(attacked).not.toBeNull();
    expect(attacked!.battle!.status).toBe("victory");
    expect(attacked!.battle!.units.find((unit) => unit.id === enemy.id)?.defeated).toBe(true);
    const gold = attacked!.party.gold;
    const finished = finishBattle(attacked!);
    expect(finished?.battle).toBeUndefined();
    expect(finished!.party.gold).toBe(gold + 7);
  });

  it("resolves an enemy turn and advances the round", () => {
    let state = startBattle(cryptState(), { enemyIds: ["core:bandit"] })!;
    const battle = state.battle!;
    const player = battle.units.find((unit) => unit.kind === "player")!;
    const enemy = battle.units.find((unit) => unit.team === "enemy")!;
    state = {
      ...state,
      battle: {
        ...battle,
        activeUnitId: enemy.id,
        units: battle.units.map((unit) =>
          unit.id === enemy.id
            ? { ...unit, position: { q: player.position.q + 1, r: player.position.r }, actionUsed: false }
            : unit,
        ),
      },
    };
    const next = battleEnemyTurn(state);
    expect(next).not.toBeNull();
    expect(next!.battle!.log.some((line) => line.includes("attacks"))).toBe(true);
    expect(next!.battle!.activeUnitId).not.toBe(enemy.id);
  });

  it("uses a class ability and spends focus", () => {
    let state = startBattle(cryptState(), { enemyIds: ["core:bandit"] })!;
    state = forcePlayerTurn(state);
    const battle = state.battle!;
    const playerUnit = battle.units.find((unit) => unit.kind === "player")!;
    const enemy = battle.units.find((unit) => unit.team === "enemy")!;
    const focusBefore = state.entities.player!.focus.current;
    const targetHex = { q: playerUnit.position.q + 1, r: playerUnit.position.r };
    state = {
      ...state,
      battle: {
        ...battle,
        units: battle.units.map((unit) =>
          unit.id === enemy.id ? { ...unit, position: targetHex, hp: 50, maxHp: 50 } : unit,
        ),
      },
    };
    const used = battleUseAbility(state, "core:power_strike", enemy.id);
    expect(used).not.toBeNull();
    expect(used!.entities.player!.focus.current).toBe(focusBefore - 2);
    expect(used!.battle!.log.some((line) => line.includes("Power Strike"))).toBe(true);
  });

  it("retreats and returns to the previous local map", () => {
    const state = startBattle(cryptState(), { enemyIds: ["core:crypt_shade"] })!;
    const retreated = retreatBattle(state);
    expect(retreated!.battle!.status).toBe("retreated");
    const finished = finishBattle(retreated!);
    expect(finished?.battle).toBeUndefined();
    expect(finished?.local).toBeTruthy();
  });

  it("adds companions to battle and resolves their turns", () => {
    const recruited = recruitCompanion(cryptState(), "core:wren").state;
    let state = startBattle(recruited, { enemyIds: ["core:crypt_shade"] })!;
    const companion = state.battle!.units.find((unit) => unit.kind === "companion");
    expect(companion).toBeDefined();
    state = {
      ...state,
      battle: {
        ...state.battle!,
        activeUnitId: companion!.id,
        units: state.battle!.units.map((unit) =>
          unit.id === companion!.id ? { ...unit, actionUsed: false, moved: 0 } : unit,
        ),
      },
    };
    const next = battleCompanionTurn(state);
    expect(next).not.toBeNull();
    expect(next!.battle!.log.some((line) => line.includes(companion!.name))).toBe(true);
  });

  it("resolves data-driven damage and conditions", () => {
    const build: CharacterBuild = {
      ...defaultCharacterBuild("Talia"),
      talentNodeIds: ["core:talent_fighter_shield_bash"],
    };
    let state = startBattle(makeState(build), { enemyIds: ["core:bandit"] })!;
    state = forcePlayerTurn(state);
    const battle = state.battle!;
    const playerUnit = battle.units.find((unit) => unit.kind === "player")!;
    const enemy = battle.units.find((unit) => unit.team === "enemy")!;
    state = {
      ...state,
      battle: {
        ...battle,
        units: battle.units.map((unit) =>
          unit.id === enemy.id
            ? {
                ...unit,
                position: { q: playerUnit.position.q + 1, r: playerUnit.position.r },
                hp: 50,
                maxHp: 50,
                ac: 1,
              }
            : unit,
        ),
      },
    };
    const focusBefore = state.entities.player!.focus.current;
    const used = battleUseAbility(state, "core:shield_bash", enemy.id);
    expect(used).not.toBeNull();
    const damaged = used!.battle!.units.find((unit) => unit.id === enemy.id)!;
    expect(damaged.hp).toBeLessThan(50);
    expect(damaged.conditions).toContain("prone");
    expect(used!.entities.player!.focus.current).toBe(focusBefore - 1);
  });

  it("applies temporary hit points from a support ability", () => {
    const build: CharacterBuild = {
      ...defaultCharacterBuild("Talia"),
      talentNodeIds: ["core:talent_fighter_rally"],
    };
    let state = startBattle(makeState(build), { enemyIds: ["core:bandit"] })!;
    state = forcePlayerTurn(state);
    const playerUnit = state.battle!.units.find((unit) => unit.kind === "player")!;
    const used = battleUseAbility(state, "core:rally", playerUnit.id);
    expect(used).not.toBeNull();
    expect(used!.battle!.units.find((unit) => unit.id === playerUnit.id)!.tempHp).toBe(4);
  });

  it("heals an ally with a targeted spell", () => {
    const cleric: CharacterBuild = {
      ...defaultCharacterBuild("Iven"),
      ancestryId: "core:dwarf",
      heritageId: "core:heritage_hill_dwarf",
      classId: "core:cleric",
      specialtyId: "core:domain_life",
      kitId: "core:kit_cleric_light",
      backgroundId: "core:acolyte",
      talentNodeIds: ["core:talent_cleric_field_medic"],
    };
    let state = startBattle(makeState(cleric), { enemyIds: ["core:bandit"] })!;
    state = forcePlayerTurn(state);
    const playerUnit = state.battle!.units.find((unit) => unit.kind === "player")!;
    state = {
      ...state,
      entities: {
        ...state.entities,
        player: { ...state.entities.player!, hp: { ...state.entities.player!.hp, current: 1 } },
      },
      battle: {
        ...state.battle!,
        units: state.battle!.units.map((unit) => (unit.id === playerUnit.id ? { ...unit, hp: 1 } : unit)),
      },
    };
    const focusBefore = state.entities.player!.focus.current;
    const used = battleUseAbility(state, "core:healing_word", playerUnit.id);
    expect(used).not.toBeNull();
    expect(used!.battle!.units.find((unit) => unit.id === playerUnit.id)!.hp).toBeGreaterThan(1);
    expect(used!.entities.player!.focus.current).toBe(focusBefore - 2);
  });

  it("maps encounter ids to enemy groups", () => {
    expect(battleEnemiesForEncounter("core:crypt_shades")).toEqual(["core:crypt_shade", "core:crypt_shade"]);
    expect(battleEnemiesForEncounter("core:road_ambush")).toContain("core:bandit");
  });
});
