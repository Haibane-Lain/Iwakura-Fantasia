import { describe, expect, it } from "vitest";
import { ANCESTRIES, BACKGROUNDS, CLASSES, ITEMS, SIGIL_IDS, SKILLS } from "./index.js";

describe("content integrity", () => {
  const skills = new Set<string>(SKILLS.map((skill) => skill.id));
  const items = new Set(ITEMS.map((item) => item.id));
  const ancestries = new Set(ANCESTRIES.map((ancestry) => ancestry.id));
  const classes = new Set(CLASSES.map((entry) => entry.id));
  const backgrounds = new Set(BACKGROUNDS.map((entry) => entry.id));

  it("has unique ids", () => {
    expect(ancestries.size).toBe(ANCESTRIES.length);
    expect(classes.size).toBe(CLASSES.length);
    expect(backgrounds.size).toBe(BACKGROUNDS.length);
    expect(items.size).toBe(ITEMS.length);
  });

  it("references valid skills and items from all ancestries", () => {
    for (const ancestry of ANCESTRIES) {
      for (const skill of ancestry.grantedSkillIds)
        expect(skills.has(skill), `${ancestry.id} → ${skill}`).toBe(true);
    }
  });

  it("references valid skills and items from all classes", () => {
    for (const characterClass of CLASSES) {
      expect(characterClass.skillChoices.length).toBeGreaterThanOrEqual(characterClass.skillChoiceCount);
      for (const skill of characterClass.skillChoices) {
        expect(skills.has(skill), `${characterClass.id} → ${skill}`).toBe(true);
      }
      for (const item of characterClass.startingItemIds) {
        expect(items.has(item), `${characterClass.id} → ${item}`).toBe(true);
      }
      for (const ability of characterClass.startingAbilityIds) {
        expect(ability).toMatch(/^core:/);
      }
    }
  });

  it("references valid skills and items from all backgrounds", () => {
    for (const background of BACKGROUNDS) {
      for (const skill of background.skillIds) {
        expect(skills.has(skill), `${background.id} → ${skill}`).toBe(true);
      }
      for (const item of background.startingItemIds) {
        expect(items.has(item), `${background.id} → ${item}`).toBe(true);
      }
    }
  });

  it("has appearance options", () => {
    expect(SIGIL_IDS.length).toBeGreaterThan(0);
  });
});
