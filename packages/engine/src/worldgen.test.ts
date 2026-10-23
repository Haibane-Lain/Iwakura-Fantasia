import { describe, expect, it } from "vitest";
import { createGameState, findStartHex, moveParty, nearbyPois, terrainAt } from "./world.js";
import { generateWorld } from "./worldgen.js";

const params = {
  width: 64,
  height: 64,
  seaLevel: 0.42,
  climate: "varied" as const,
  magicLevel: "standard" as const,
  danger: "normal" as const,
  settlementDensity: 0.5,
};

const settings = {
  worldSource: "procedural" as const,
  seed: "test-seed",
  genParams: params,
  difficulty: "normal" as const,
  contentRating: "teen" as const,
  aiEnabled: true,
};

describe("world generation", () => {
  it("is deterministic for a seed", () => {
    const first = generateWorld({ source: "procedural", seed: "deterministic", params });
    const second = generateWorld({ source: "procedural", seed: "deterministic", params });
    expect(second.world).toEqual(first.world);
    expect(second.report.stats).toEqual(first.report.stats);
  });

  it("passes validation for several procedural seeds", () => {
    for (const seed of ["alpha", "beta", "gamma"]) {
      const result = generateWorld({ source: "procedural", seed, params });
      expect(
        result.report.errors,
        `${seed}: ${result.report.errors.map((error) => error.message).join("; ")}`,
      ).toEqual([]);
      expect(result.report.passed).toBe(true);
      expect(result.report.stats.landTiles).toBeGreaterThan(0);
      expect(result.report.stats.settlements).toBeGreaterThan(0);
      expect(result.report.stats.biomes.ocean).toBeGreaterThan(0);
    }
  });

  it("builds a valid handcrafted pack", () => {
    const result = generateWorld({ source: "handcrafted", seed: "core:redford_reach", params });
    expect(result.report.errors).toEqual([]);
    expect(result.report.passed).toBe(true);
    expect(result.world.source).toBe("handcrafted");
    expect(result.world.terrain).toHaveLength(result.world.width * result.world.height);
    expect(result.world.pois.some((poi) => poi.kind === "town")).toBe(true);
    expect(result.world.pois.some((poi) => poi.kind === "dungeon")).toBe(true);
    expect(result.report.stats.roads).toBeGreaterThan(0);
  });

  it("rejects an unknown handcrafted pack", () => {
    expect(() =>
      generateWorld({ source: "handcrafted", seed: "missing", params, packId: "missing" }),
    ).toThrow(/Unknown handcrafted/);
  });
});

describe("world state and travel", () => {
  const generated = generateWorld({ source: "handcrafted", seed: "core:redford_reach", params });

  it("starts the party on land and reveals fog", () => {
    const state = createGameState({
      world: generated.world,
      settings: { ...settings, worldSource: "handcrafted", seed: "core:redford_reach" },
      campaignId: "campaign-test",
      campaignName: "Test Chronicle",
      now: new Date("2026-10-23T08:00:00.000Z"),
    });
    expect(terrainAt(state.world, state.party.position)).not.toMatch(/ocean|coast|lake/);
    expect(state.world.fog.filter((value) => value === 2).length).toBeGreaterThan(20);
    expect(state.world.pois.some((poi) => poi.discovered)).toBe(true);
    expect(state.entities.player?.hex).toEqual(state.party.position);
    expect(state.campaign.name).toBe("Test Chronicle");
  });

  it("travels, advances the clock, and reveals more fog", () => {
    const state = createGameState({
      world: generated.world,
      settings: { ...settings, worldSource: "handcrafted", seed: "core:redford_reach" },
      campaignId: "campaign-test",
      campaignName: "Test Chronicle",
      now: new Date("2026-10-23T08:00:00.000Z"),
    });
    const target = nearbyPois(state.world, state.party.position, 6).find((poi) => poi.kind === "village");
    expect(target).toBeDefined();
    const result = moveParty(state, target!.hex);
    expect(result).not.toBeNull();
    expect(result!.path.length).toBeGreaterThan(0);
    expect(result!.state.party.position).toEqual(target!.hex);
    expect(result!.minutes).toBeGreaterThan(0);
    expect(result!.state.clock.day).toBe(1);
    expect(result!.state.rng.cursor).toBeGreaterThanOrEqual(state.rng.cursor);
  });

  it("cannot travel into deep water", () => {
    const state = createGameState({
      world: generated.world,
      settings: { ...settings, worldSource: "handcrafted", seed: "core:redford_reach" },
      campaignId: "campaign-test",
      campaignName: "Test Chronicle",
    });
    const ocean = { q: 0, r: 0 };
    expect(moveParty(state, ocean)).toBeNull();
  });

  it("finds a land start hex", () => {
    const start = findStartHex(generated.world);
    expect(terrainAt(generated.world, start)).not.toMatch(/ocean|coast/);
  });
});
