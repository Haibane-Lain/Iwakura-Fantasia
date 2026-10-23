import type { CharacterBuild } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import {
  abilityModifier,
  computeArmorClass,
  createPlayerEntity,
  defaultCharacterBuild,
  equipItem,
  maxFocus,
  rollSkillCheck,
  saveModifier,
  skillModifier,
  startingInventory,
  unequipItem,
} from "./character.js";
import { createGameState } from "./world.js";
import { generateWorld } from "./worldgen.js";

const humanFighter: CharacterBuild = {
  name: "Ardan Vell",
  pronouns: "he/him",
  ancestryId: "core:human",
  classId: "core:fighter",
  backgroundId: "core:soldier",
  baseAttributes: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  skillIds: ["athletics", "intimidation", "perception", "survival"],
  appearance: { palette: "ember", sigil: "sword", seed: "ardan" },
};

const elfWizard: CharacterBuild = {
  name: "Ilyra",
  pronouns: "she/her",
  ancestryId: "core:elf",
  classId: "core:wizard",
  backgroundId: "core:scholar",
  baseAttributes: { str: 8, dex: 15, con: 12, int: 15, wis: 12, cha: 10 },
  skillIds: ["arcana", "history", "perception", "investigation"],
  appearance: { palette: "frost", sigil: "eye", seed: "ilyra" },
};

describe("character rules", () => {
  it("computes ability modifiers", () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(20)).toBe(5);
  });

  it("creates a human fighter with derived stats and gear", () => {
    const entity = createPlayerEntity(humanFighter);
    expect(entity.attributes).toEqual({ str: 16, dex: 15, con: 14, int: 13, wis: 11, cha: 9 });
    expect(entity.hp).toEqual({ current: 12, max: 12 });
    expect(entity.ac).toBe(13);
    expect(entity.focus.max).toBe(6);
    expect(entity.speed).toBe(6);
    expect(entity.equipment.mainHand).toBe("core:longsword");
    expect(entity.equipment.armor).toBe("core:leather_armor");
    expect(entity.skillIds).toEqual(
      expect.arrayContaining(["athletics", "intimidation", "perception", "survival"]),
    );
    expect(entity.appearance?.palette).toBe("ember");
  });

  it("creates an elf wizard with ancestry and class skills", () => {
    const entity = createPlayerEntity(elfWizard);
    expect(entity.attributes.dex).toBe(17);
    expect(entity.attributes.wis).toBe(13);
    expect(entity.hp.max).toBe(7);
    expect(entity.ac).toBe(13);
    expect(entity.focus.max).toBe(6);
    expect(entity.skillIds).toContain("perception");
    expect(entity.skillIds).toContain("arcana");
    expect(entity.equipment.mainHand).toBe("core:staff");
  });

  it("derives armor class from armor and dexterity", () => {
    const entity = createPlayerEntity(humanFighter);
    expect(computeArmorClass(entity.attributes, {})).toBe(12);
    expect(computeArmorClass(entity.attributes, { armor: "core:leather_armor" })).toBe(13);
  });

  it("deduplicates background and class starting items", () => {
    expect(startingInventory("core:soldier", "core:fighter")).toEqual([
      { itemId: "core:longsword", quantity: 1 },
      { itemId: "core:leather_armor", quantity: 1 },
    ]);
  });

  it("computes focus from the class's primary attribute", () => {
    expect(maxFocus({ str: 16, dex: 15, con: 14, int: 13, wis: 11, cha: 9 }, "core:fighter")).toBe(6);
    expect(maxFocus({ str: 8, dex: 17, con: 12, int: 15, wis: 13, cha: 10 }, "core:wizard")).toBe(6);
  });

  it("computes skill and save modifiers", () => {
    const entity = createPlayerEntity(humanFighter);
    expect(skillModifier(entity, "athletics")).toBe(5);
    expect(skillModifier(entity, "stealth")).toBe(2);
    expect(saveModifier(entity, "str")).toBe(5);
    expect(saveModifier(entity, "wis")).toBe(0);
  });

  it("equips and unequips armor", () => {
    let state = createGameState({
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
      build: humanFighter,
    });
    expect(state.entities.player?.ac).toBe(13);
    state = unequipItem(state, "armor");
    expect(state.entities.player?.ac).toBe(12);
    state = equipItem(state, "core:leather_armor");
    expect(state.entities.player?.ac).toBe(13);
  });

  it("rolls a deterministic skill check and advances the rng", () => {
    const state = createGameState({
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
      build: humanFighter,
    });
    const first = rollSkillCheck(state, "perception", 12);
    expect(first.result.modifier).toBe(2);
    expect(first.result.total).toBe(first.result.die + 2);
    expect(first.state.rng.cursor).toBe(state.rng.cursor + 1);
    const second = rollSkillCheck(first.state, "perception", 12);
    expect(second.result.die).not.toBeUndefined();
  });

  it("provides a default M1-compatible build", () => {
    const entity = createPlayerEntity(defaultCharacterBuild("Traveller"));
    expect(entity.name).toBe("Traveller");
    expect(entity.skillIds.length).toBeGreaterThanOrEqual(2);
    expect(entity.inventory.length).toBeGreaterThan(0);
  });
});
