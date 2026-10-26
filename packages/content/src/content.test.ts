import { describe, expect, it } from "vitest";
import {
  ABILITIES,
  ANCESTRIES,
  BACKGROUNDS,
  CLASSES,
  CONDITIONS,
  FEATS,
  ITEMS,
  LANGUAGES,
  SIGIL_IDS,
  SKILLS,
  SUBCLASSES,
  TALENT_TREES,
  TOOLS,
} from "./index.js";

describe("content integrity", () => {
  const skills = new Set<string>(SKILLS.map((skill) => skill.id));
  const items = new Set<string>(ITEMS.map((item) => item.id));
  const abilities = new Set<string>(ABILITIES.map((ability) => ability.id));
  const conditions = new Set<string>(CONDITIONS.map((condition) => condition.id));
  const ancestries = new Set<string>(ANCESTRIES.map((ancestry) => ancestry.id));
  const classes = new Set<string>(CLASSES.map((entry) => entry.id));
  const backgrounds = new Set<string>(BACKGROUNDS.map((entry) => entry.id));
  const subclasses = new Set<string>(SUBCLASSES.map((entry) => entry.id));
  const trees = new Set<string>(TALENT_TREES.map((entry) => entry.id));
  const tools = new Set<string>(TOOLS.map((entry) => entry.id));
  const languages = new Set<string>(LANGUAGES.map((entry) => entry.id));
  const feats = new Set<string>(FEATS.map((entry) => entry.id));

  it("has unique ids", () => {
    expect(ancestries.size).toBe(ANCESTRIES.length);
    expect(classes.size).toBe(CLASSES.length);
    expect(backgrounds.size).toBe(BACKGROUNDS.length);
    expect(items.size).toBe(ITEMS.length);
    expect(abilities.size).toBe(ABILITIES.length);
    expect(subclasses.size).toBe(SUBCLASSES.length);
    expect(trees.size).toBe(TALENT_TREES.length);
    expect(feats.size).toBe(FEATS.length);
  });

  it("references valid skills, heritages, and abilities from all ancestries", () => {
    for (const ancestry of ANCESTRIES) {
      for (const skill of ancestry.grantedSkillIds) {
        expect(skills.has(skill), `${ancestry.id} → ${skill}`).toBe(true);
      }
      for (const trait of ancestry.traits) {
        for (const effect of trait.effects ?? []) {
          if (effect.kind === "skill_proficiency" || effect.kind === "expertise") {
            expect(skills.has(effect.skillId), `${ancestry.id} → ${effect.skillId}`).toBe(true);
          }
          if (effect.kind === "grant_ability") {
            expect(abilities.has(effect.abilityId), `${ancestry.id} → ${effect.abilityId}`).toBe(true);
          }
        }
      }
      for (const heritage of ancestry.heritages) {
        expect(heritage.id.length).toBeGreaterThan(0);
        for (const trait of heritage.traits) {
          for (const effect of trait.effects ?? []) {
            if (effect.kind === "skill_proficiency" || effect.kind === "expertise") {
              expect(skills.has(effect.skillId), `${heritage.id} → ${effect.skillId}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it("references valid abilities, skills, items, subclasses, and trees from all classes", () => {
    for (const characterClass of CLASSES) {
      expect(characterClass.skillChoices.length).toBeGreaterThanOrEqual(characterClass.skillChoiceCount);
      for (const skill of characterClass.skillChoices) {
        expect(skills.has(skill), `${characterClass.id} → ${skill}`).toBe(true);
      }
      for (const item of characterClass.startingItemIds) {
        expect(items.has(item), `${characterClass.id} → ${item}`).toBe(true);
      }
      for (const ability of characterClass.startingAbilityIds) {
        expect(abilities.has(ability), `${characterClass.id} → ${ability}`).toBe(true);
      }
      for (const kit of characterClass.startingKits) {
        for (const item of kit.itemIds) {
          expect(items.has(item), `${characterClass.id}/${kit.id} → ${item}`).toBe(true);
        }
      }
      for (const specialty of characterClass.specialties) {
        for (const ability of specialty.abilityIds) {
          expect(abilities.has(ability), `${characterClass.id}/${specialty.id} → ${ability}`).toBe(true);
        }
      }
      for (const subclassId of characterClass.subclassIds) {
        expect(subclasses.has(subclassId), `${characterClass.id} → ${subclassId}`).toBe(true);
      }
      if (characterClass.talentTreeId) {
        expect(trees.has(characterClass.talentTreeId), `${characterClass.id} → tree`).toBe(true);
      }
      for (const feature of characterClass.levelFeatures) {
        for (const ability of feature.abilityIds) {
          expect(abilities.has(ability), `${characterClass.id}/${feature.name} → ${ability}`).toBe(true);
        }
      }
    }
  });

  it("keeps subclasses attached to their class and abilities valid", () => {
    for (const subclass of SUBCLASSES) {
      expect(classes.has(subclass.classId), `${subclass.id} → ${subclass.classId}`).toBe(true);
      for (const feature of subclass.features) {
        for (const ability of feature.abilityIds) {
          expect(abilities.has(ability), `${subclass.id}/${feature.name} → ${ability}`).toBe(true);
        }
      }
    }
  });

  it("keeps talent trees well-formed and reachable", () => {
    for (const tree of TALENT_TREES) {
      expect(classes.has(tree.classId), `${tree.id} → ${tree.classId}`).toBe(true);
      const nodeIds = new Set(tree.nodes.map((node) => node.id));
      expect(nodeIds.size).toBe(tree.nodes.length);
      expect(tree.nodes.some((node) => node.tier === 1 && node.prerequisites.length === 0)).toBe(true);
      for (const node of tree.nodes) {
        for (const prerequisite of node.prerequisites) {
          expect(nodeIds.has(prerequisite), `${node.id} → ${prerequisite}`).toBe(true);
        }
        for (const ability of node.abilityIds) {
          expect(abilities.has(ability), `${node.id} → ${ability}`).toBe(true);
        }
      }
    }
  });

  it("references valid conditions and abilities from ability effects", () => {
    for (const ability of ABILITIES) {
      for (const effect of ability.effects) {
        if (effect.kind === "condition") {
          expect(conditions.has(effect.conditionId), `${ability.id} → ${effect.conditionId}`).toBe(true);
        }
      }
    }
    for (const feat of FEATS) {
      for (const ability of feat.abilityIds) {
        expect(abilities.has(ability), `${feat.id} → ${ability}`).toBe(true);
      }
    }
  });

  it("references valid skills, items, tools, and languages from all backgrounds", () => {
    for (const background of BACKGROUNDS) {
      for (const skill of background.skillIds) {
        expect(skills.has(skill), `${background.id} → ${skill}`).toBe(true);
      }
      for (const item of background.startingItemIds) {
        expect(items.has(item), `${background.id} → ${item}`).toBe(true);
      }
      for (const tool of background.toolProficiencyIds) {
        expect(tools.has(tool), `${background.id} → ${tool}`).toBe(true);
      }
      for (const language of background.languageIds) {
        expect(languages.has(language), `${background.id} → ${language}`).toBe(true);
      }
    }
  });

  it("has appearance options", () => {
    expect(SIGIL_IDS.length).toBeGreaterThan(0);
  });
});
