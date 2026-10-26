import { describe, expect, it } from "vitest";
import {
  engineFacingToActorFacing,
  facingFromVector,
  facingIsBack,
  facingIsLeft,
  facingIsSide,
  facingToward,
  resolveActorAppearance,
} from "./actor-appearance";

describe("actor appearance", () => {
  it("derives a fighter silhouette from class and equipment", () => {
    const appearance = resolveActorAppearance({
      id: "player",
      name: "Ardan Vell",
      palette: "gold",
      ancestryId: "core:human",
      classId: "core:fighter",
      mainHand: "core:longsword",
      offHand: "core:leather_armor",
      sigil: "sword",
    });
    expect(appearance.body).toBe("human");
    expect(appearance.archetype).toBe("fighter");
    expect(appearance.weapon).toBe("sword");
    expect(appearance.offhand).toBe("shield");
    expect(appearance.sigil).toBe("sword");
  });

  it("gives dwarves a broader, shorter silhouette with a beard", () => {
    const appearance = resolveActorAppearance({
      id: "core:maud",
      ancestryId: "core:dwarf",
      role: "Captain of the Redford watch",
      palette: "ink",
    });
    expect(appearance.body).toBe("dwarf");
    expect(appearance.beard).toBe(true);
    expect(appearance.scale).toBeLessThan(1.2);
    expect(appearance.archetype).toBe("guard");
  });

  it("maps wolf and crypt shade enemies to non-humanoid rigs", () => {
    const wolf = resolveActorAppearance({
      id: "enemy:0:core:wolf",
      name: "Grey wolf",
      palette: "ink",
      enemyId: "core:wolf",
      tags: ["beast", "road"],
    });
    expect(wolf.body).toBe("wolf");
    expect(wolf.weapon).toBe("bite");

    const shade = resolveActorAppearance({
      id: "enemy:1:core:crypt_shade",
      name: "Crypt shade",
      palette: "frost",
      enemyId: "core:crypt_shade",
      tags: ["undead", "crypt"],
    });
    expect(shade.body).toBe("shade");
    expect(shade.weapon).toBe("spectral");
  });

  it("uses NPC archetypes and ancestry for civilian silhouettes", () => {
    const merchant = resolveActorAppearance({
      id: "core:bryn",
      role: "Market trader",
      archetype: "merchant",
      ancestryId: "core:human",
      palette: "ember",
    });
    expect(merchant.archetype).toBe("merchant");
    expect(merchant.weapon).toBe("none");
  });
});

describe("actor facing", () => {
  it("maps screen vectors to all eight directions", () => {
    expect(facingFromVector(1, 0)).toBe("e");
    expect(facingFromVector(1, 1)).toBe("se");
    expect(facingFromVector(0, 1)).toBe("s");
    expect(facingFromVector(-1, 1)).toBe("sw");
    expect(facingFromVector(-1, 0)).toBe("w");
    expect(facingFromVector(-1, -1)).toBe("nw");
    expect(facingFromVector(0, -1)).toBe("n");
    expect(facingFromVector(1, -1)).toBe("ne");
  });

  it("keeps the six saved engine facings compatible", () => {
    expect([0, 1, 2, 3, 4, 5].map((facing) => engineFacingToActorFacing(facing))).toEqual([
      "e",
      "ne",
      "nw",
      "w",
      "sw",
      "se",
    ]);
  });

  it("reports front, side, back, and mirroring buckets", () => {
    expect(facingIsBack("n")).toBe(true);
    expect(facingIsBack("s")).toBe(false);
    expect(facingIsLeft("sw")).toBe(true);
    expect(facingIsSide("e")).toBe(true);
    expect(facingFromVector(0, 0, "w")).toBe("w");
  });

  it("faces toward another point", () => {
    expect(facingToward({ x: 0, y: 0 }, { x: 20, y: -20 })).toBe("ne");
  });
});
