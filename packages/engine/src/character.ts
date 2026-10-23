import { getAncestry, getBackground, getClass, getItem, getSkill, SKILLS } from "@iwakura/content";
import type {
  AttributeKey,
  Attributes,
  CharacterBuild,
  Entity,
  Equipment,
  GameState,
  InventoryEntry,
} from "@iwakura/contracts";
import { rngFromGameState } from "./state-rng.js";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function finalAttributes(base: Attributes, ancestryId: string): Attributes {
  const ancestry = getAncestry(ancestryId);
  const result: Attributes = { ...base };
  if (!ancestry) return result;
  for (const [key, bonus] of Object.entries(ancestry.bonuses) as Array<[AttributeKey, number]>) {
    result[key] = Math.max(1, Math.min(30, result[key] + bonus));
  }
  return result;
}

export function computeArmorClass(attributes: Attributes, equipment: Equipment): number {
  const dex = abilityModifier(attributes.dex);
  const armor = equipment.armor ? getItem(equipment.armor) : undefined;
  let ac = 10 + dex;
  if (armor) {
    const base = Number(armor.stats.ac ?? 10);
    const type = String(armor.stats.armorType ?? "light");
    const dexPart = type === "heavy" ? 0 : type === "medium" ? Math.min(dex, 2) : dex;
    ac = base + dexPart;
  }
  if (equipment.offHand) {
    const shield = getItem(equipment.offHand);
    if (shield && (shield.kind === "shield" || shield.stats.shield === true)) ac += 2;
  }
  return ac;
}

function autoEquip(inventory: InventoryEntry[]): Equipment {
  const equipment: Equipment = {};
  for (const entry of inventory) {
    const item = getItem(entry.itemId);
    if (!item) continue;
    if (item.kind === "weapon" && !equipment.mainHand) equipment.mainHand = item.id;
    if (item.kind === "armor" && !equipment.armor) equipment.armor = item.id;
    if (item.kind === "shield" && !equipment.offHand) equipment.offHand = item.id;
  }
  return equipment;
}

export function startingInventory(backgroundId: string, classId: string): InventoryEntry[] {
  const background = getBackground(backgroundId);
  const characterClass = getClass(classId);
  const ids = [...(background?.startingItemIds ?? []), ...(characterClass?.startingItemIds ?? [])];
  const unique: string[] = [];
  for (const id of ids) if (!unique.includes(id)) unique.push(id);
  return unique.map((itemId) => ({ itemId, quantity: 1 }));
}

export function maxFocus(attributes: Attributes, classId: string): number {
  const characterClass = getClass(classId);
  if (!characterClass) return 0;
  const primary = Math.max(
    0,
    ...characterClass.primaryAttributes.map((attribute) => abilityModifier(attributes[attribute])),
  );
  return Math.max(0, characterClass.focusPerLevel + primary);
}

export function createPlayerEntity(build: CharacterBuild): Entity {
  const ancestry = getAncestry(build.ancestryId);
  const characterClass = getClass(build.classId);
  const background = getBackground(build.backgroundId);
  if (!ancestry) throw new Error(`Unknown ancestry: ${build.ancestryId}`);
  if (!characterClass) throw new Error(`Unknown class: ${build.classId}`);
  if (!background) throw new Error(`Unknown background: ${build.backgroundId}`);

  const attributes = finalAttributes(build.baseAttributes, build.ancestryId);
  const conMod = abilityModifier(attributes.con);
  const hpMax = Math.max(1, characterClass.hitDie + conMod);
  const focusMax = maxFocus(attributes, build.classId);
  const inventory = startingInventory(build.backgroundId, build.classId);
  const equipment = autoEquip(inventory);
  const ac = computeArmorClass(attributes, equipment);
  const skills = Array.from(
    new Set([...build.skillIds, ...ancestry.grantedSkillIds].filter((id) => Boolean(getSkill(id)))),
  );

  return {
    id: "player",
    kind: "player",
    name: build.name,
    pronouns: build.pronouns,
    description: `${ancestry.name} ${characterClass.name} · ${background.name}. ${background.hook}`,
    ancestryId: build.ancestryId,
    classId: build.classId,
    backgroundId: build.backgroundId,
    level: 1,
    attributes,
    hp: { current: hpMax, max: hpMax },
    ac,
    speed: ancestry.movement,
    focus: { current: focusMax, max: focusMax },
    conditions: [],
    abilityIds: [...characterClass.startingAbilityIds],
    inventory,
    equipment,
    skillIds: skills,
    appearance: build.appearance,
    recruitable: false,
    companion: false,
    tags: ["player"],
  };
}

export function defaultCharacterBuild(name = "Wanderer"): CharacterBuild {
  return {
    name,
    pronouns: "they/them",
    ancestryId: "core:human",
    classId: "core:fighter",
    backgroundId: "core:soldier",
    baseAttributes: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    skillIds: ["athletics", "intimidation", "perception", "survival"],
    appearance: { palette: "verdant", sigil: "hex", seed: name },
  };
}

export interface SkillCheckResult {
  skillId: string;
  die: number;
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
}

export function skillModifier(entity: Entity, skillId: string): number {
  const skill = getSkill(skillId);
  if (!skill) return 0;
  const base = abilityModifier(entity.attributes[skill.attribute]);
  return base + (entity.skillIds.includes(skillId) ? proficiencyBonus(entity.level) : 0);
}

export function saveModifier(entity: Entity, attribute: AttributeKey): number {
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const proficient = characterClass?.savingThrows.includes(attribute) ?? false;
  return abilityModifier(entity.attributes[attribute]) + (proficient ? proficiencyBonus(entity.level) : 0);
}

export function allSkillModifiers(
  entity: Entity,
): Array<{ id: string; name: string; attribute: AttributeKey; modifier: number; proficient: boolean }> {
  return SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    attribute: skill.attribute,
    modifier: skillModifier(entity, skill.id),
    proficient: entity.skillIds.includes(skill.id),
  }));
}

export function rollSkillCheck(
  state: GameState,
  skillId: string,
  dc?: number,
): { state: GameState; result: SkillCheckResult } {
  const entity = state.entities.player;
  if (!entity) throw new Error("No player entity in the campaign");
  const rng = rngFromGameState(state);
  const die = rng.d20();
  const modifier = skillModifier(entity, skillId);
  const total = die + modifier;
  const snapshot = rng.snapshot();
  return {
    state: {
      ...state,
      rng: { seed: snapshot.seed, state: snapshot.state, cursor: snapshot.cursor },
    },
    result: {
      skillId,
      die,
      modifier,
      total,
      ...(dc !== undefined ? { dc, success: total >= dc } : {}),
    },
  };
}

export type EquipmentSlot = "mainHand" | "offHand" | "armor";

export function equipmentSlotForItem(itemId: string): EquipmentSlot | null {
  const item = getItem(itemId);
  if (!item) return null;
  if (item.kind === "weapon") return "mainHand";
  if (item.kind === "armor") return "armor";
  if (item.kind === "shield") return "offHand";
  return null;
}

export function equipItem(state: GameState, itemId: string): GameState {
  const entity = state.entities.player;
  if (!entity) return state;
  if (!entity.inventory.some((entry) => entry.itemId === itemId)) return state;
  const slot = equipmentSlotForItem(itemId);
  if (!slot) return state;
  const equipment = { ...entity.equipment, [slot]: itemId };
  const ac = computeArmorClass(entity.attributes, equipment);
  return {
    ...state,
    entities: { ...state.entities, player: { ...entity, equipment, ac } },
  };
}

export function unequipItem(state: GameState, slot: EquipmentSlot): GameState {
  const entity = state.entities.player;
  if (!entity) return state;
  const equipment = { ...entity.equipment };
  delete equipment[slot];
  const ac = computeArmorClass(entity.attributes, equipment);
  return {
    ...state,
    entities: { ...state.entities, player: { ...entity, equipment, ac } },
  };
}
