import type { GameState } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import { finishBattle, retreatBattle } from "./battle.js";
import { findPath } from "./hex.js";
import { leaveLocalMap, localIsWalkable } from "./local.js";
import {
  beginTravelBattle,
  createTravelState,
  crossTravelEdge,
  enterTravelGate,
  enterTravelMap,
  fastTravel,
  travelEdgeAt,
  travelEnemyNear,
  travelPortHex,
} from "./travel.js";
import { createGameState } from "./world.js";
import { generateWorld } from "./worldgen.js";

function makeState(): GameState {
  const world = generateWorld({ source: "handcrafted", seed: "core:redford_reach" }).world;
  return createGameState({
    world,
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
    campaignId: "travel-test",
    campaignName: "Travel Test",
  });
}

function atRedford(state: GameState): GameState {
  const redford = state.world.pois.find((poi) => poi.id === "core:redford");
  expect(redford).toBeDefined();
  return { ...state, party: { ...state.party, position: redford!.hex } };
}

describe("travel maps", () => {
  it("generates a deterministic wilderness map with reachable gates", () => {
    const state = atRedford(makeState());
    const first = enterTravelMap(state)!.state.travel!;
    const second = createTravelState(state, state.party.position)!;
    expect(first.map.kind).toBe("wilderness");
    expect(first.map.tiles).toEqual(second.map.tiles);
    expect(first.enemies.length).toBeGreaterThan(0);
    expect(first.gates.length).toBeGreaterThan(0);
    for (const exit of first.map.exits) {
      const route = findPath(first.map.entrance, exit.hex, (hex) =>
        localIsWalkable(first.map, hex) ? 1 : null,
      );
      expect(route, `gate ${exit.id}`).not.toBeNull();
    }
    for (const gate of first.gates) {
      const route = findPath(first.map.entrance, gate.gateHex, (hex) =>
        localIsWalkable(first.map, hex) ? 1 : null,
      );
      expect(route, `settlement gate ${gate.name}`).not.toBeNull();
    }
  });

  it("crosses into a neighbouring world hex and places the party at the opposite edge", () => {
    const state = enterTravelMap(atRedford(makeState()))!.state;
    const exit = state.travel!.map.exits[0]!;
    expect(travelEdgeAt(state, exit.hex)).toBeDefined();
    const crossed = crossTravelEdge(state, exit.direction!)!;
    expect(crossed.state.party.position).not.toEqual(state.party.position);
    expect(crossed.state.travel?.worldHex).toEqual(crossed.state.party.position);
    expect(crossed.state.travel?.position).not.toEqual(travelPortHex(exit.direction!));
    expect(crossed.state.clock.minute + crossed.state.clock.hour * 60).toBeGreaterThan(
      state.clock.minute + state.clock.hour * 60,
    );
  });

  it("enters a settlement gate and returns to the same outside position", () => {
    const state = enterTravelMap(atRedford(makeState()))!.state;
    const gate = state.travel!.gates.find((entry) => entry.poiId === "core:redford")!;
    expect(gate).toBeDefined();
    const entered = enterTravelGate(state, gate.poiId)!;
    expect(entered.local?.poiId).toBe("core:redford");
    const outside = entered.travel?.gateOutside;
    const left = leaveLocalMap(entered);
    expect(left.local).toBeUndefined();
    expect(left.travel?.position).toEqual(outside);
  });

  it("starts combat from a visible travel enemy group and resumes travel", () => {
    let state = enterTravelMap(atRedford(makeState()))!.state;
    const group = state.travel!.enemies[0]!;
    state = {
      ...state,
      travel: { ...state.travel!, position: group.hex },
    };
    expect(travelEnemyNear(state, group.hex)?.id).toBe(group.id);
    const battle = beginTravelBattle(state, group.id)!;
    expect(battle.battle?.source).toBe("travel");
    expect(battle.battle?.map?.kind).toBe("wilderness");
    expect(battle.battle?.travelGroupId).toBe(group.id);
    const retreated = retreatBattle(battle)!;
    const finished = finishBattle(retreated)!;
    expect(finished.battle).toBeUndefined();
    expect(finished.travel).toBeDefined();
    expect(finished.travel?.enemies.some((entry) => entry.id === group.id)).toBe(false);
    const revisited = createTravelState(finished, finished.travel!.worldHex)!;
    expect(revisited.enemies.some((entry) => entry.id === group.id)).toBe(false);
  });

  it("validates fast travel destinations and updates world position", () => {
    const state = makeState();
    const destination = state.world.pois.find((poi) => poi.id === "core:millbrook")!;
    const result = fastTravel(
      {
        ...state,
        world: { ...state.world, pois: state.world.pois.map((poi) => ({ ...poi, discovered: true })) },
      },
      destination.hex,
    )!;
    expect(result).not.toBeNull();
    expect(result.state.party.position).toEqual(destination.hex);
    expect(result.state.travel).toBeDefined();
    expect(result.state.travel?.gates.some((gate) => gate.poiId === "core:millbrook")).toBe(true);
    expect(result.minutes).toBeGreaterThan(0);
  });
});
