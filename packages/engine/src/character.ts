import {
  getAbility,
  getAncestry,
  getBackground,
  getClass,
  getFeat,
  getHeritage,
  getItem,
  getSkill,
  getSubclass,
  getTalentTree,
  SKILLS,
} from "@iwakura/content";
import type {
  AttributeKey,
  Attributes,
  CharacterBuild,
  Entity,
  Equipment,
  FeatureEffect,
  GameState,
  InventoryEntry,
  ProgressionState,
  TalentNode,
} from "@iwakura/contracts";
import type { AdvantageMode } from "./rng.js";
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

export function emptyProgression(): ProgressionState {
  return {
    milestones: 0,
    pendingLevelUps: 0,
    talentPoints: 0,
    spentTalentNodeIds: [],
    featIds: [],
    asiChoices: {},
    expertiseSkillIds: [],
    toolProficiencyIds: [],
    languageIds: [],
    resistances: [],
    notes: [],
  };
}

export function finalAttributes(base: Attributes, ancestryId: string, heritageId?: string): Attributes {
  const ancestry = getAncestry(ancestryId);
  const heritage = getHeritage(ancestryId, heritageId);
  const result: Attributes = { ...base };
  if (!ancestry) return result;
  for (const [key, bonus] of Object.entries(ancestry.bonuses) as Array<[AttributeKey, number]>) {
    result[key] = Math.max(1, Math.min(30, result[key] + bonus));
  }
  if (heritage) {
    for (const [key, bonus] of Object.entries(heritage.bonuses) as Array<[AttributeKey, number]>) {
      result[key] = Math.max(1, Math.min(30, result[key] + bonus));
    }
  }
  return result;
}

function traitEffects(traits: Array<{ effects?: FeatureEffect[] }> | undefined): FeatureEffect[] {
  return (traits ?? []).flatMap((trait) => trait.effects ?? []);
}

/**
 * Collects passive effects from every source attached to an entity. This is
 * the single source of truth for ancestry traits, heritages, backgrounds,
 * class features, specialties, subclasses, talent nodes, and feats.
 */
export function collectFeatureEffects(entity: Entity): FeatureEffect[] {
  const effects: FeatureEffect[] = [];
  const ancestry = entity.ancestryId ? getAncestry(entity.ancestryId) : undefined;
  if (ancestry) effects.push(...traitEffects(ancestry.traits));
  const heritage = getHeritage(entity.ancestryId ?? "", entity.heritageId);
  if (heritage) {
    effects.push(...(heritage.effects ?? []));
    effects.push(...traitEffects(heritage.traits));
  }
  const background = entity.backgroundId ? getBackground(entity.backgroundId) : undefined;
  if (background) effects.push(...(background.originEffects ?? []));

  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  if (characterClass) {
    const specialty = characterClass.specialties.find((entry) => entry.id === entity.progression.specialtyId);
    if (specialty) effects.push(...(specialty.effects ?? []));
    for (const feature of characterClass.levelFeatures) {
      if (feature.level <= entity.level) effects.push(...(feature.effects ?? []));
    }
  }

  const subclass = entity.progression.subclassId ? getSubclass(entity.progression.subclassId) : undefined;
  if (subclass) {
    for (const feature of subclass.features) {
      if (feature.level <= entity.level) effects.push(...(feature.effects ?? []));
    }
  }

  const tree =
    (entity.progression.talentTreeId ? getTalentTree(entity.progression.talentTreeId) : undefined) ??
    (characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined);
  if (tree) {
    for (const nodeId of entity.progression.spentTalentNodeIds) {
      const node = tree.nodes.find((entry) => entry.id === nodeId);
      if (node) effects.push(...(node.effects ?? []));
    }
  }

  for (const featId of entity.progression.featIds) {
    const feat = getFeat(featId);
    if (feat) effects.push(...(feat.effects ?? []));
  }
  return effects;
}

function effectSum(
  effects: FeatureEffect[],
  stat:
    | "ac"
    | "attack"
    | "damage"
    | "initiative"
    | "speed"
    | "focus"
    | "max_hp_per_level"
    | "save"
    | "skill"
    | "passive",
  filter?: { attribute?: AttributeKey; skillId?: string },
): number {
  return effects.reduce((sum, effect) => {
    if (effect.kind !== "stat" || effect.stat !== stat) return sum;
    if (filter?.attribute && effect.attribute && effect.attribute !== filter.attribute) return sum;
    if (filter?.skillId && effect.skillId && effect.skillId !== filter.skillId) return sum;
    return sum + effect.value;
  }, 0);
}

function effectAbilities(effects: FeatureEffect[]): string[] {
  return effects
    .filter(
      (effect): effect is Extract<FeatureEffect, { kind: "grant_ability" }> =>
        effect.kind === "grant_ability",
    )
    .map((effect) => effect.abilityId);
}

function effectSkills(effects: FeatureEffect[]): string[] {
  return effects
    .filter(
      (effect): effect is Extract<FeatureEffect, { kind: "skill_proficiency" }> =>
        effect.kind === "skill_proficiency",
    )
    .map((effect) => effect.skillId);
}

function effectExpertise(effects: FeatureEffect[]): string[] {
  return effects
    .filter((effect): effect is Extract<FeatureEffect, { kind: "expertise" }> => effect.kind === "expertise")
    .map((effect) => effect.skillId);
}

function effectTools(effects: FeatureEffect[]): string[] {
  return effects
    .filter(
      (effect): effect is Extract<FeatureEffect, { kind: "tool_proficiency" }> =>
        effect.kind === "tool_proficiency",
    )
    .map((effect) => effect.toolId);
}

function effectLanguages(effects: FeatureEffect[]): string[] {
  return effects
    .filter((effect): effect is Extract<FeatureEffect, { kind: "language" }> => effect.kind === "language")
    .map((effect) => effect.languageId);
}

function effectResistances(effects: FeatureEffect[]): string[] {
  return effects
    .filter(
      (effect): effect is Extract<FeatureEffect, { kind: "resistance" }> => effect.kind === "resistance",
    )
    .map((effect) => effect.damageType);
}

export function featureAbilities(entity: Entity): string[] {
  const effects = collectFeatureEffects(entity);
  const ids = new Set<string>(effectAbilities(effects));
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  if (characterClass) {
    for (const id of characterClass.startingAbilityIds) ids.add(id);
    const specialty = characterClass.specialties.find((entry) => entry.id === entity.progression.specialtyId);
    for (const id of specialty?.abilityIds ?? []) ids.add(id);
    for (const feature of characterClass.levelFeatures) {
      if (feature.level <= entity.level) for (const id of feature.abilityIds) ids.add(id);
    }
  }
  const subclass = entity.progression.subclassId ? getSubclass(entity.progression.subclassId) : undefined;
  if (subclass) {
    for (const feature of subclass.features) {
      if (feature.level <= entity.level) for (const id of feature.abilityIds) ids.add(id);
    }
  }
  const tree =
    (entity.progression.talentTreeId ? getTalentTree(entity.progression.talentTreeId) : undefined) ??
    (characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined);
  if (tree) {
    for (const nodeId of entity.progression.spentTalentNodeIds) {
      const node = tree.nodes.find((entry) => entry.id === nodeId);
      for (const id of node?.abilityIds ?? []) ids.add(id);
    }
  }
  for (const featId of entity.progression.featIds) {
    const feat = getFeat(featId);
    for (const id of feat?.abilityIds ?? []) ids.add(id);
  }
  return [...ids].filter((id) => Boolean(getAbility(id)));
}

export function computeArmorClass(
  attributes: Attributes,
  equipment: Equipment,
  effects: FeatureEffect[] = [],
): number {
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
  return Math.max(1, ac + effectSum(effects, "ac"));
}

function autoEquip(inventory: InventoryEntry[]): Equipment {
  const equipment: Equipment = {};
  let weaponScore = -1;
  let armorScore = -1;
  for (const entry of inventory) {
    const item = getItem(entry.itemId);
    if (!item) continue;
    if (item.kind === "weapon") {
      const score = Number.parseInt(String(item.stats.damage ?? "1d4").split("d")[0] ?? "1", 10);
      if (score > weaponScore) {
        weaponScore = score;
        equipment.mainHand = item.id;
      }
    }
    if (item.kind === "armor") {
      const score = Number(item.stats.ac ?? 10);
      if (score > armorScore) {
        armorScore = score;
        equipment.armor = item.id;
      }
    }
    if (item.kind === "shield" && !equipment.offHand) equipment.offHand = item.id;
  }
  return equipment;
}

export function startingInventory(backgroundId: string, classId: string, kitId?: string): InventoryEntry[] {
  const background = getBackground(backgroundId);
  const characterClass = getClass(classId);
  const kit = characterClass?.startingKits.find((entry) => entry.id === kitId);
  const ids = [
    ...(background?.startingItemIds ?? []),
    ...(kit?.itemIds ?? characterClass?.startingItemIds ?? []),
  ];
  const unique: string[] = [];
  for (const id of ids) if (!unique.includes(id)) unique.push(id);
  return unique.map((itemId) => ({ itemId, quantity: 1 }));
}

export function maxFocus(
  attributes: Attributes,
  classId: string,
  level = 1,
  effects: FeatureEffect[] = [],
): number {
  const characterClass = getClass(classId);
  if (!characterClass) return 0;
  const primary = Math.max(
    0,
    ...characterClass.primaryAttributes.map((attribute) => abilityModifier(attributes[attribute])),
  );
  return Math.max(
    0,
    characterClass.focusPerLevel +
      primary +
      (Math.max(1, level) - 1) * characterClass.focusGainPerLevel +
      effectSum(effects, "focus"),
  );
}

export function maxHitPoints(entity: Entity): number {
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  if (!characterClass) return entity.hp.max;
  const con = abilityModifier(entity.attributes.con);
  const perLevel = Math.max(1, Math.floor(characterClass.hitDie / 2) + 1 + con);
  const effects = collectFeatureEffects(entity);
  return Math.max(
    1,
    characterClass.hitDie +
      con +
      (Math.max(1, entity.level) - 1) * perLevel +
      effectSum(effects, "max_hp_per_level") * Math.max(1, entity.level),
  );
}

export function maxSpeed(entity: Entity): number {
  const ancestry = entity.ancestryId ? getAncestry(entity.ancestryId) : undefined;
  const effects = collectFeatureEffects(entity);
  return Math.max(1, Math.min(20, (ancestry?.movement ?? 6) + effectSum(effects, "speed")));
}

export function addItemToInventory(
  inventory: InventoryEntry[],
  itemId: string,
  quantity = 1,
): InventoryEntry[] {
  const existing = inventory.find((entry) => entry.itemId === itemId);
  if (existing) {
    return inventory.map((entry) =>
      entry.itemId === itemId ? { ...entry, quantity: Math.min(999, entry.quantity + quantity) } : entry,
    );
  }
  return [...inventory, { itemId, quantity: Math.min(999, Math.max(1, quantity)) }];
}

function talentNodesForBuild(build: CharacterBuild): TalentNode[] {
  const characterClass = getClass(build.classId);
  const tree = characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined;
  if (!tree) return [];
  return build.talentNodeIds
    .map((id) => tree.nodes.find((node) => node.id === id))
    .filter((node): node is TalentNode => Boolean(node));
}

export function totalTalentPoints(level: number): number {
  return Math.max(1, Math.min(20, level));
}

export function spentTalentCost(build: CharacterBuild): number {
  return talentNodesForBuild(build).reduce((sum, node) => sum + node.cost, 0);
}

export function validateTalentPicks(build: CharacterBuild): string[] {
  const errors: string[] = [];
  const characterClass = getClass(build.classId);
  const tree = characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined;
  if (build.talentNodeIds.length > 0 && !tree) {
    errors.push("This class has no talent tree.");
    return errors;
  }
  const picked = new Set<string>();
  for (const node of talentNodesForBuild(build)) {
    if (node.level > build.startLevel) {
      errors.push(`${node.name} requires level ${node.level}.`);
    }
    for (const prerequisite of node.prerequisites) {
      if (!build.talentNodeIds.includes(prerequisite)) {
        errors.push(`${node.name} requires ${prerequisite}.`);
      }
    }
    if (picked.has(node.id)) errors.push(`${node.name} is picked twice.`);
    picked.add(node.id);
  }
  const cost = spentTalentCost(build);
  if (cost > totalTalentPoints(build.startLevel)) {
    errors.push(
      `Talent picks cost ${cost} points but only ${totalTalentPoints(build.startLevel)} are available.`,
    );
  }
  return errors;
}

export function validateCharacterBuild(build: CharacterBuild): string[] {
  const errors: string[] = [];
  const ancestry = getAncestry(build.ancestryId);
  const characterClass = getClass(build.classId);
  const background = getBackground(build.backgroundId);
  if (!ancestry) errors.push(`Unknown ancestry: ${build.ancestryId}`);
  if (!characterClass) errors.push(`Unknown class: ${build.classId}`);
  if (!background) errors.push(`Unknown background: ${build.backgroundId}`);
  if (build.heritageId && !getHeritage(build.ancestryId, build.heritageId)) {
    errors.push(`Unknown heritage: ${build.heritageId}`);
  }
  if (build.specialtyId && characterClass) {
    if (!characterClass.specialties.some((entry) => entry.id === build.specialtyId)) {
      errors.push(`Unknown specialty: ${build.specialtyId}`);
    }
  }
  if (build.kitId && characterClass) {
    if (!characterClass.startingKits.some((entry) => entry.id === build.kitId)) {
      errors.push(`Unknown starting kit: ${build.kitId}`);
    }
  }
  if (build.subclassId) {
    const subclass = getSubclass(build.subclassId);
    if (!subclass || subclass.classId !== build.classId) errors.push(`Unknown subclass: ${build.subclassId}`);
    if (characterClass && build.startLevel < characterClass.subclassLevel) {
      errors.push(`Subclass requires level ${characterClass.subclassLevel}.`);
    }
  } else if (characterClass && build.startLevel >= characterClass.subclassLevel) {
    errors.push(`Choose a subclass for level ${characterClass.subclassLevel}.`);
  }
  for (const featId of build.featIds) {
    const feat = getFeat(featId);
    if (!feat) errors.push(`Unknown feat: ${featId}`);
    else if (feat.level > build.startLevel) errors.push(`${feat.name} requires level ${feat.level}.`);
  }
  const skills = new Set<string>(SKILLS.map((entry) => entry.id));
  for (const skillId of build.skillIds) if (!skills.has(skillId)) errors.push(`Unknown skill: ${skillId}`);
  for (const skillId of build.expertiseSkillIds) {
    if (!build.skillIds.includes(skillId)) errors.push(`Expertise requires proficiency: ${skillId}`);
  }
  for (const abilityId of characterClass?.startingAbilityIds ?? []) {
    if (!getAbility(abilityId)) errors.push(`Unknown starting ability: ${abilityId}`);
  }
  errors.push(...validateTalentPicks(build));
  return errors;
}

function applyDerivedStats(entity: Entity, refill = false): Entity {
  const effects = collectFeatureEffects(entity);
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const background = entity.backgroundId ? getBackground(entity.backgroundId) : undefined;
  const ancestry = entity.ancestryId ? getAncestry(entity.ancestryId) : undefined;
  const skillIds = new Set<string>([
    ...entity.skillIds,
    ...(ancestry?.grantedSkillIds ?? []),
    ...(background?.skillIds ?? []),
    ...effectSkills(effects),
  ]);
  const expertise = new Set<string>([...entity.progression.expertiseSkillIds, ...effectExpertise(effects)]);
  const tools = new Set<string>([
    ...entity.progression.toolProficiencyIds,
    ...(background?.toolProficiencyIds ?? []),
    ...effectTools(effects),
  ]);
  const languages = new Set<string>([
    ...entity.progression.languageIds,
    ...(background?.languageIds ?? []),
    ...effectLanguages(effects),
  ]);
  const resistances = effectResistances(effects);
  const abilityIds = featureAbilities(entity);
  const ac = computeArmorClass(entity.attributes, entity.equipment, effects);
  const hpMax = maxHitPoints(entity);
  const focusMax = characterClass ? maxFocus(entity.attributes, characterClass.id, entity.level, effects) : 0;
  const speed = maxSpeed(entity);
  const oldMax = entity.hp.max;
  const nextHp = refill || entity.hp.current >= oldMax ? hpMax : Math.min(entity.hp.current, hpMax);
  const nextFocus =
    refill || entity.focus.current >= entity.focus.max ? focusMax : Math.min(entity.focus.current, focusMax);
  const tree =
    (entity.progression.talentTreeId ? getTalentTree(entity.progression.talentTreeId) : undefined) ??
    (characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined);
  const spentTalentCost = entity.progression.spentTalentNodeIds.reduce(
    (sum, id) => sum + (tree?.nodes.find((node) => node.id === id)?.cost ?? 0),
    0,
  );
  const expectedTalentPoints =
    entity.kind === "player" && characterClass
      ? Math.max(0, totalTalentPoints(entity.level) - spentTalentCost)
      : entity.progression.talentPoints;
  return {
    ...entity,
    ac,
    speed,
    hp: { current: nextHp, max: hpMax },
    focus: { current: nextFocus, max: focusMax },
    abilityIds,
    skillIds: [...skillIds],
    progression: {
      ...entity.progression,
      talentPoints: Math.max(entity.progression.talentPoints, expectedTalentPoints),
      expertiseSkillIds: [...expertise],
      toolProficiencyIds: [...tools],
      languageIds: [...languages],
      resistances,
    },
  };
}

export function recomputeEntity(entity: Entity, refill = false): Entity {
  return applyDerivedStats(entity, refill);
}

function progressionForBuild(build: CharacterBuild): ProgressionState {
  const characterClass = getClass(build.classId);
  const cost = spentTalentCost(build);
  return {
    ...emptyProgression(),
    milestones: Math.max(0, build.startLevel - 1),
    pendingLevelUps: 0,
    subclassId: build.subclassId,
    specialtyId: build.specialtyId,
    talentPoints: Math.max(0, totalTalentPoints(build.startLevel) - cost),
    spentTalentNodeIds: [...new Set(build.talentNodeIds)],
    featIds: [...new Set(build.featIds)],
    expertiseSkillIds: [...new Set(build.expertiseSkillIds)],
    toolProficiencyIds: [...new Set(build.toolProficiencyIds)],
    languageIds: [...new Set(build.languageIds)],
    talentTreeId: characterClass?.talentTreeId,
  };
}

export function createPlayerEntity(build: CharacterBuild): Entity {
  const errors = validateCharacterBuild(build);
  if (errors.length > 0) throw new Error(errors.join(" "));
  const ancestry = getAncestry(build.ancestryId)!;
  const characterClass = getClass(build.classId)!;
  const background = getBackground(build.backgroundId)!;
  const heritage = getHeritage(build.ancestryId, build.heritageId);
  const attributes = finalAttributes(build.baseAttributes, build.ancestryId, build.heritageId);
  const inventory = startingInventory(build.backgroundId, build.classId, build.kitId);
  const equipment = autoEquip(inventory);
  const base: Entity = {
    id: "player",
    kind: "player",
    name: build.name,
    pronouns: build.pronouns,
    description: `${ancestry.name}${heritage ? ` (${heritage.name})` : ""} ${characterClass.name} · ${background.name}. ${background.hook}`,
    ancestryId: build.ancestryId,
    ...(build.heritageId ? { heritageId: build.heritageId } : {}),
    classId: build.classId,
    backgroundId: build.backgroundId,
    level: build.startLevel,
    attributes,
    hp: { current: 1, max: 1 },
    ac: 10,
    speed: ancestry.movement,
    focus: { current: 0, max: 0 },
    conditions: [],
    abilityIds: [],
    inventory,
    equipment,
    skillIds: [...new Set([...build.skillIds, ...ancestry.grantedSkillIds, ...background.skillIds])],
    progression: progressionForBuild(build),
    appearance: build.appearance,
    recruitable: false,
    companion: false,
    tags: ["player", characterClass.role],
  };
  return recomputeEntity(base, true);
}

export function defaultCharacterBuild(name = "Wanderer"): CharacterBuild {
  return {
    name,
    pronouns: "they/them",
    ancestryId: "core:human",
    heritageId: "core:heritage_frontier",
    classId: "core:fighter",
    specialtyId: "core:style_dueling",
    backgroundId: "core:soldier",
    kitId: "core:kit_fighter_guard",
    baseAttributes: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    skillIds: ["athletics", "intimidation", "perception", "survival"],
    expertiseSkillIds: [],
    toolProficiencyIds: [],
    languageIds: [],
    talentNodeIds: [],
    featIds: [],
    startLevel: 1,
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

export function featureSkillBonus(entity: Entity, skillId: string): number {
  return effectSum(collectFeatureEffects(entity), "skill", { skillId });
}

export function featureSaveBonus(entity: Entity, attribute: AttributeKey): number {
  return effectSum(collectFeatureEffects(entity), "save", { attribute });
}

export function featureAttackBonus(entity: Entity): number {
  return effectSum(collectFeatureEffects(entity), "attack");
}

export function featureDamageBonus(entity: Entity): number {
  return effectSum(collectFeatureEffects(entity), "damage");
}

export function featureInitiativeBonus(entity: Entity): number {
  return effectSum(collectFeatureEffects(entity), "initiative");
}

export function skillModifier(entity: Entity, skillId: string): number {
  const skill = getSkill(skillId);
  if (!skill) return 0;
  const base = abilityModifier(entity.attributes[skill.attribute]);
  const proficient = entity.skillIds.includes(skillId);
  const expertise = entity.progression.expertiseSkillIds.includes(skillId);
  const bonus = proficiencyBonus(entity.level) * (expertise ? 2 : proficient ? 1 : 0);
  return base + bonus + featureSkillBonus(entity, skillId);
}

export function passiveScore(entity: Entity, skillId: string): number {
  return 10 + skillModifier(entity, skillId);
}

export function saveModifier(entity: Entity, attribute: AttributeKey): number {
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const proficient = characterClass?.savingThrows.includes(attribute) ?? false;
  return (
    abilityModifier(entity.attributes[attribute]) +
    (proficient ? proficiencyBonus(entity.level) : 0) +
    featureSaveBonus(entity, attribute)
  );
}

export function attackBonus(entity: Entity, attribute: AttributeKey): number {
  return (
    proficiencyBonus(entity.level) +
    abilityModifier(entity.attributes[attribute]) +
    featureAttackBonus(entity)
  );
}

export function damageBonus(entity: Entity): number {
  return featureDamageBonus(entity);
}

export function initiativeBonus(entity: Entity): number {
  return abilityModifier(entity.attributes.dex) + featureInitiativeBonus(entity);
}

export function allSkillModifiers(entity: Entity): Array<{
  id: string;
  name: string;
  attribute: AttributeKey;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
}> {
  return SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    attribute: skill.attribute,
    modifier: skillModifier(entity, skill.id),
    proficient: entity.skillIds.includes(skill.id),
    expertise: entity.progression.expertiseSkillIds.includes(skill.id),
  }));
}

export function rollSkillCheck(
  state: GameState,
  skillId: string,
  dc?: number,
  mode: AdvantageMode = "normal",
): { state: GameState; result: SkillCheckResult } {
  const entity = state.entities.player;
  if (!entity) throw new Error("No player entity in the campaign");
  const rng = rngFromGameState(state);
  const die = rng.d20(mode);
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
  const next = recomputeEntity({ ...entity, equipment });
  return {
    ...state,
    entities: { ...state.entities, player: next },
  };
}

export function unequipItem(state: GameState, slot: EquipmentSlot): GameState {
  const entity = state.entities.player;
  if (!entity) return state;
  const equipment = { ...entity.equipment };
  delete equipment[slot];
  const next = recomputeEntity({ ...entity, equipment });
  return {
    ...state,
    entities: { ...state.entities, player: next },
  };
}

export function getTalentNodeForEntity(entity: Entity, nodeId: string): TalentNode | undefined {
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const tree =
    (entity.progression.talentTreeId ? getTalentTree(entity.progression.talentTreeId) : undefined) ??
    (characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined);
  return tree?.nodes.find((node) => node.id === nodeId);
}

export function availableTalentNodes(entity: Entity): TalentNode[] {
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const tree =
    (entity.progression.talentTreeId ? getTalentTree(entity.progression.talentTreeId) : undefined) ??
    (characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined);
  if (!tree) return [];
  return tree.nodes.filter((node) => {
    if (entity.progression.spentTalentNodeIds.includes(node.id)) return false;
    if (node.level > entity.level) return false;
    return node.prerequisites.every((id) => entity.progression.spentTalentNodeIds.includes(id));
  });
}

export function talentCostForEntity(entity: Entity, nodeId: string): number {
  return getTalentNodeForEntity(entity, nodeId)?.cost ?? 99;
}
