import { z } from "zod";

/** Stable identifiers are namespaced, e.g. "core:longsword". */
export const ContentIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9_]+:[a-z0-9_]+$/);
export type ContentId = z.infer<typeof ContentIdSchema>;

export const AttributeKeySchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
export type AttributeKey = z.infer<typeof AttributeKeySchema>;

export const AttributesSchema = z.object({
  str: z.number().int().min(1).max(30),
  dex: z.number().int().min(1).max(30),
  con: z.number().int().min(1).max(30),
  int: z.number().int().min(1).max(30),
  wis: z.number().int().min(1).max(30),
  cha: z.number().int().min(1).max(30),
});
export type Attributes = z.infer<typeof AttributesSchema>;

export const AttributeBonusesSchema = z.partialRecord(AttributeKeySchema, z.number().int().min(-4).max(4));

export const DamageTypeSchema = z.enum([
  "physical",
  "slashing",
  "piercing",
  "bludgeoning",
  "fire",
  "cold",
  "lightning",
  "poison",
  "necrotic",
  "radiant",
  "psychic",
  "force",
  "acid",
  "thunder",
]);
export type DamageType = z.infer<typeof DamageTypeSchema>;

/**
 * Passive effects shared by ancestry traits, heritages, class features,
 * subclasses, talent nodes, and feats. Active combat effects live in
 * AbilityEffectSchema.
 */
export const FeatureEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skill_proficiency"), skillId: z.string().min(1) }),
  z.object({ kind: z.literal("expertise"), skillId: z.string().min(1) }),
  z.object({ kind: z.literal("tool_proficiency"), toolId: z.string().min(1) }),
  z.object({ kind: z.literal("language"), languageId: z.string().min(1) }),
  z.object({ kind: z.literal("resistance"), damageType: DamageTypeSchema }),
  z.object({
    kind: z.literal("stat"),
    stat: z.enum([
      "ac",
      "attack",
      "damage",
      "initiative",
      "speed",
      "focus",
      "max_hp_per_level",
      "save",
      "skill",
      "passive",
    ]),
    value: z.number().int().min(-5).max(10),
    attribute: AttributeKeySchema.optional(),
    skillId: z.string().optional(),
  }),
  z.object({ kind: z.literal("grant_ability"), abilityId: ContentIdSchema }),
]);
export type FeatureEffect = z.infer<typeof FeatureEffectSchema>;

export const TraitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  effects: z.array(FeatureEffectSchema).default([]),
});
export type Trait = z.infer<typeof TraitSchema>;

export const HeritageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  bonuses: AttributeBonusesSchema.default({}),
  traits: z.array(TraitSchema).default([]),
  effects: z.array(FeatureEffectSchema).default([]),
});
export type Heritage = z.infer<typeof HeritageSchema>;

export const AncestrySchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  bonuses: AttributeBonusesSchema,
  traits: z.array(TraitSchema).min(1),
  movement: z.number().int().min(3).max(10).default(6),
  grantedSkillIds: z.array(z.string()).default([]),
  extraSkillChoices: z.number().int().min(0).max(2).default(0),
  heritages: z.array(HeritageSchema).default([]),
  playable: z.boolean().default(true),
});
export type Ancestry = z.infer<typeof AncestrySchema>;

export const ConditionIdSchema = z.string().min(1).max(80);
export type ConditionId = z.infer<typeof ConditionIdSchema>;

export const ConditionDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1),
  description: z.string().min(1),
  acBonus: z.number().int().min(-10).max(10).default(0),
  attackBonus: z.number().int().min(-10).max(10).default(0),
  saveBonus: z.number().int().min(-10).max(10).default(0),
  damageBonus: z.number().int().min(-10).max(10).default(0),
  damageTakenBonus: z.number().int().min(-10).max(10).default(0),
});
export type ConditionDefinition = z.infer<typeof ConditionDefinitionSchema>;

export const AbilityEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("damage"),
    dice: z.string().min(1).optional(),
    damageType: DamageTypeSchema.default("physical"),
    addAttribute: AttributeKeySchema.optional(),
    addLevel: z.boolean().default(false),
    scaling: z.enum(["none", "level", "level_div_2"]).default("none"),
    bonus: z.number().int().min(-10).max(20).default(0),
  }),
  z.object({
    kind: z.literal("heal"),
    dice: z.string().min(1).default("1d4"),
    addAttribute: AttributeKeySchema.optional(),
    addLevel: z.boolean().default(false),
    bonus: z.number().int().min(-10).max(20).default(0),
    target: z.enum(["self", "target"]).default("target"),
  }),
  z.object({
    kind: z.literal("temp_hp"),
    dice: z.string().min(1).optional(),
    value: z.number().int().min(0).max(50).optional(),
    addAttribute: AttributeKeySchema.optional(),
    target: z.enum(["self", "target"]).default("self"),
  }),
  z.object({
    kind: z.literal("condition"),
    conditionId: z.string().min(1),
    duration: z.number().int().min(1).max(20).default(1),
    target: z.enum(["self", "target"]).default("target"),
  }),
  z.object({
    kind: z.literal("movement"),
    mode: z.enum(["dash", "disengage"]).default("dash"),
  }),
  z.object({
    kind: z.literal("resource"),
    resource: z.enum(["focus", "hp"]),
    value: z.number().int().min(1).max(30),
  }),
  z.object({
    kind: z.literal("cleanse"),
    target: z.enum(["self", "target"]).default("self"),
  }),
]);
export type AbilityEffect = z.infer<typeof AbilityEffectSchema>;

export const AbilitySchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tier: z.number().int().min(1).max(10),
  cost: z.number().int().min(0).max(20).default(0),
  cooldown: z.number().int().min(0).max(20).default(0),
  action: z.enum(["action", "bonus", "reaction", "free"]).default("action"),
  targetType: z.enum(["enemy", "ally", "self", "any"]).default("enemy"),
  attack: z.boolean().default(false),
  attribute: AttributeKeySchema.optional(),
  targeting: z.enum(["self", "single", "cone", "line", "burst", "aura"]),
  rangeHexes: z.number().int().min(0).max(30),
  effects: z.array(AbilityEffectSchema).default([]),
  tags: z.array(z.string()).default([]),
});
export type Ability = z.infer<typeof AbilitySchema>;

export const SpecialtySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  effects: z.array(FeatureEffectSchema).default([]),
  abilityIds: z.array(ContentIdSchema).default([]),
});
export type Specialty = z.infer<typeof SpecialtySchema>;

export const StartingKitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  itemIds: z.array(ContentIdSchema).default([]),
  gold: z.number().int().min(0).default(0),
});
export type StartingKit = z.infer<typeof StartingKitSchema>;

export const ClassFeatureSchema = z.object({
  level: z.number().int().min(1).max(20),
  name: z.string().min(1),
  description: z.string().min(1),
  effects: z.array(FeatureEffectSchema).default([]),
  abilityIds: z.array(ContentIdSchema).default([]),
});
export type ClassFeature = z.infer<typeof ClassFeatureSchema>;

export const CharacterClassSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  role: z.enum(["martial", "expert", "arcane", "divine", "primal", "occult"]).default("martial"),
  complexity: z.enum(["simple", "moderate", "complex"]).default("moderate"),
  playstyle: z.string().default(""),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  primaryAttributes: z.array(AttributeKeySchema).min(1).max(2),
  spellAttribute: AttributeKeySchema.optional(),
  savingThrows: z.array(AttributeKeySchema).min(1).max(3),
  focusPerLevel: z.number().int().min(0).max(20),
  focusGainPerLevel: z.number().int().min(0).max(10).default(1),
  focusName: z.string().min(1),
  armorProficiency: z.array(z.enum(["light", "medium", "heavy", "shield"])),
  weaponProficiency: z.array(z.enum(["simple", "martial", "ranged", "finesse"])),
  startingAbilityIds: z.array(ContentIdSchema).min(1),
  startingItemIds: z.array(ContentIdSchema).default([]),
  startingKits: z.array(StartingKitSchema).default([]),
  specialties: z.array(SpecialtySchema).default([]),
  subclassLevel: z.number().int().min(1).max(10).default(3),
  subclassIds: z.array(ContentIdSchema).default([]),
  talentTreeId: ContentIdSchema.optional(),
  levelFeatures: z.array(ClassFeatureSchema).default([]),
  skillChoices: z.array(z.string()).default([]),
  skillChoiceCount: z.number().int().min(0).max(4).default(2),
  playable: z.boolean().default(true),
});
export type CharacterClass = z.infer<typeof CharacterClassSchema>;

export const SubclassSchema = z.object({
  id: ContentIdSchema,
  classId: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  level: z.number().int().min(1).max(20).default(3),
  features: z.array(ClassFeatureSchema).min(1),
});
export type Subclass = z.infer<typeof SubclassSchema>;

export const TalentNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  branch: z.string().min(1),
  tier: z.number().int().min(1).max(5),
  level: z.number().int().min(1).max(20).default(1),
  cost: z.number().int().min(1).max(3).default(1),
  prerequisites: z.array(z.string()).default([]),
  effects: z.array(FeatureEffectSchema).default([]),
  abilityIds: z.array(ContentIdSchema).default([]),
});
export type TalentNode = z.infer<typeof TalentNodeSchema>;

export const TalentTreeSchema = z.object({
  id: ContentIdSchema,
  classId: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  nodes: z.array(TalentNodeSchema).min(1),
});
export type TalentTree = z.infer<typeof TalentTreeSchema>;

export const FeatSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  level: z.number().int().min(1).max(20).default(1),
  effects: z.array(FeatureEffectSchema).default([]),
  abilityIds: z.array(ContentIdSchema).default([]),
});
export type Feat = z.infer<typeof FeatSchema>;

export const BackgroundSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  skillIds: z.array(z.string()).min(1).max(3),
  toolOrLanguage: z.string().default(""),
  toolProficiencyIds: z.array(z.string()).default([]),
  languageIds: z.array(z.string()).default([]),
  startingItemIds: z.array(ContentIdSchema),
  hook: z.string().min(1),
  originEffects: z.array(FeatureEffectSchema).default([]),
  playable: z.boolean().default(true),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const ItemSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(["weapon", "armor", "shield", "consumable", "tool", "treasure", "quest"]),
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]).default("common"),
  valueGold: z.number().int().min(0),
  stackable: z.boolean().default(false),
  stats: z.record(z.string(), z.unknown()).default({}),
});
export type Item = z.infer<typeof ItemSchema>;

export const EnemyDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  hp: z.number().int().min(1).max(200),
  ac: z.number().int().min(1).max(30),
  speed: z.number().int().min(1).max(12).default(6),
  attackBonus: z.number().int().min(-5).max(20).default(2),
  damageDice: z.string().min(1).max(20).default("1d6"),
  damageBonus: z.number().int().min(0).max(20).default(0),
  range: z.number().int().min(1).max(12).default(1),
  initiativeBonus: z.number().int().min(-5).max(10).default(0),
  gold: z.number().int().min(0).max(500).default(0),
  palette: z.string().min(1).max(40).default("ember"),
  tags: z.array(z.string()).default([]),
});
export type EnemyDefinition = z.infer<typeof EnemyDefinitionSchema>;

export const FactionDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
});
export type FactionDefinition = z.infer<typeof FactionDefinitionSchema>;

export type TraitInput = z.input<typeof TraitSchema>;
export type HeritageInput = z.input<typeof HeritageSchema>;
export type AncestryInput = z.input<typeof AncestrySchema>;
export type ConditionDefinitionInput = z.input<typeof ConditionDefinitionSchema>;
export type AbilityEffectInput = z.input<typeof AbilityEffectSchema>;
export type AbilityInput = z.input<typeof AbilitySchema>;
export type SpecialtyInput = z.input<typeof SpecialtySchema>;
export type StartingKitInput = z.input<typeof StartingKitSchema>;
export type ClassFeatureInput = z.input<typeof ClassFeatureSchema>;
export type CharacterClassInput = z.input<typeof CharacterClassSchema>;
export type SubclassInput = z.input<typeof SubclassSchema>;
export type TalentNodeInput = z.input<typeof TalentNodeSchema>;
export type TalentTreeInput = z.input<typeof TalentTreeSchema>;
export type FeatInput = z.input<typeof FeatSchema>;
export type BackgroundInput = z.input<typeof BackgroundSchema>;
