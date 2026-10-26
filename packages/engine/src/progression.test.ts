import { CLASSES, getTalentTree } from "@iwakura/content";
import type { CharacterBuild, GameState } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import {
  attackBonus,
  availableTalentNodes,
  createPlayerEntity,
  defaultCharacterBuild,
  maxHitPoints,
  skillModifier,
} from "./character.js";
import {
  applyLevelUp,
  awardMilestone,
  milestoneProgress,
  normalizeGameState,
  refundTalentPoints,
  spendTalentPoint,
} from "./progression.js";
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

function fighterBuild(overrides: Partial<CharacterBuild> = {}): CharacterBuild {
  return {
    ...defaultCharacterBuild("Mara"),
    talentNodeIds: ["core:talent_fighter_shield_bash"],
    ...overrides,
  };
}

describe("character progression", () => {
  it("applies heritage, specialty, kit, and starting talent at creation", () => {
    const entity = createPlayerEntity(fighterBuild());
    expect(entity.attributes.con).toBe(15);
    expect(entity.hp.max).toBe(12);
    expect(entity.ac).toBe(15);
    expect(entity.abilityIds).toContain("core:shield_bash");
    expect(entity.skillIds).toContain("survival");
    expect(entity.equipment.mainHand).toBe("core:longsword");
    expect(entity.progression.talentPoints).toBe(0);
  });

  it("uses a class kit instead of the default class items", () => {
    const entity = createPlayerEntity(
      fighterBuild({
        kitId: "core:kit_fighter_vanguard",
        talentNodeIds: [],
      }),
    );
    expect(entity.equipment.mainHand).toBe("core:greatsword");
    expect(entity.equipment.armor).toBe("core:scale_mail");
    expect(entity.ac).toBe(16);
  });

  it("validates talent prerequisites and costs", () => {
    expect(() =>
      createPlayerEntity(
        fighterBuild({
          talentNodeIds: ["core:talent_fighter_unbroken"],
        }),
      ),
    ).toThrow();
  });

  it("awards milestones and advances through subclass and feat levels", () => {
    let state = makeState(fighterBuild());
    const levelOneAttack = attackBonus(state.entities.player!, "str");
    const levelOneHp = state.entities.player!.hp.max;

    state = awardMilestone(state, 1, "Cleared the road.");
    expect(milestoneProgress(state.entities.player!).pending).toBe(1);
    const levelTwo = applyLevelUp(state);
    expect(levelTwo).not.toBeNull();
    state = levelTwo!;
    expect(state.entities.player!.level).toBe(2);
    expect(state.entities.player!.progression.talentPoints).toBe(1);
    expect(attackBonus(state.entities.player!, "str")).toBe(levelOneAttack + 1);
    expect(state.entities.player!.hp.max).toBeGreaterThan(levelOneHp);

    state = awardMilestone(state, 1, "Reached the crypt.");
    expect(milestoneProgress(state.entities.player!).needsSubclass).toBe(true);
    expect(applyLevelUp(state)).toBeNull();
    state = applyLevelUp(state, { subclassId: "core:fighter_champion" })!;
    expect(state.entities.player!.level).toBe(3);
    expect(state.entities.player!.progression.subclassId).toBe("core:fighter_champion");

    state = awardMilestone(state, 1, "Won the crypt fight.");
    const hpBeforeFeat = state.entities.player!.hp.max;
    state = applyLevelUp(state, { featId: "core:feat_tough" })!;
    expect(state.entities.player!.level).toBe(4);
    expect(state.entities.player!.progression.featIds).toContain("core:feat_tough");
    expect(state.entities.player!.hp.max).toBeGreaterThan(hpBeforeFeat);
    expect(milestoneProgress(state.entities.player!).pending).toBe(0);
  });

  it("spends and refunds talent points", () => {
    let state = makeState(
      fighterBuild({
        talentNodeIds: [],
      }),
    );
    const before = attackBonus(state.entities.player!, "str");
    const available = availableTalentNodes(state.entities.player!).map((node) => node.id);
    expect(available).toContain("core:talent_fighter_precision");
    expect(available).not.toContain("core:talent_fighter_duelist_grace");

    state = spendTalentPoint(state, "core:talent_fighter_precision")!;
    expect(state.entities.player!.progression.talentPoints).toBe(0);
    expect(attackBonus(state.entities.player!, "str")).toBe(before + 1);

    state = refundTalentPoints(state, 25)!;
    expect(state.party.gold).toBe(0);
    expect(state.entities.player!.progression.talentPoints).toBe(1);
    expect(attackBonus(state.entities.player!, "str")).toBe(before);
  });

  it("creates a valid level-1 character for every class", () => {
    for (const characterClass of CLASSES) {
      const tree = characterClass.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined;
      const firstNode = tree?.nodes.find((node) => node.level <= 1 && node.prerequisites.length === 0);
      const build: CharacterBuild = {
        ...defaultCharacterBuild(characterClass.name),
        classId: characterClass.id,
        specialtyId: characterClass.specialties[0]?.id,
        kitId: characterClass.startingKits[0]?.id,
        skillIds: characterClass.skillChoices.slice(0, characterClass.skillChoiceCount),
        talentNodeIds: firstNode ? [firstNode.id] : [],
      };
      const entity = createPlayerEntity(build);
      expect(entity.level).toBe(1);
      expect(entity.abilityIds.length).toBeGreaterThan(0);
      expect(entity.hp.max).toBeGreaterThan(0);
      expect(entity.progression.talentPoints).toBe(firstNode ? 0 : 1);
    }
  });

  it("repairs old saves that predate talent points", () => {
    const state = makeState(fighterBuild({ talentNodeIds: [] }));
    const player = state.entities.player!;
    const oldSave: GameState = {
      ...state,
      entities: {
        ...state.entities,
        player: {
          ...player,
          progression: { ...player.progression, talentPoints: 0 },
        },
      },
    };
    const normalized = normalizeGameState(oldSave);
    expect(normalized.entities.player!.progression.talentPoints).toBe(1);
  });

  it("supports expertise and passive-derived statistics", () => {
    const rogue: CharacterBuild = {
      ...defaultCharacterBuild("Sable"),
      classId: "core:rogue",
      specialtyId: "core:specialty_face",
      kitId: "core:kit_rogue_thief",
      backgroundId: "core:criminal",
      heritageId: "core:heritage_cosmopolitan",
      baseAttributes: { str: 8, dex: 15, con: 12, int: 10, wis: 12, cha: 14 },
      skillIds: ["stealth", "deception", "acrobatics", "perception"],
      expertiseSkillIds: ["stealth"],
      talentNodeIds: ["core:talent_rogue_shadowstep"],
    };
    const entity = createPlayerEntity(rogue);
    const dexMod = Math.floor((entity.attributes.dex - 10) / 2);
    expect(skillModifier(entity, "stealth")).toBe(dexMod + 5);
    expect(entity.progression.toolProficiencyIds).toContain("thieves_tools");
    expect(entity.progression.expertiseSkillIds).toContain("stealth");
    expect(entity.abilityIds).toContain("core:shadowstep");
    expect(entity.progression.talentPoints).toBe(0);
    expect(maxHitPoints(entity)).toBe(entity.hp.max);
  });
});
