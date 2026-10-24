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

export const TraitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});
export type Trait = z.infer<typeof TraitSchema>;

export const AncestrySchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  bonuses: AttributeBonusesSchema,
  traits: z.array(TraitSchema).min(1),
  movement: z.number().int().min(3).max(10).default(6),
  grantedSkillIds: z.array(z.string()).default([]),
  extraSkillChoices: z.number().int().min(0).max(2).default(0),
  playable: z.boolean().default(true),
});
export type Ancestry = z.infer<typeof AncestrySchema>;

export const CharacterClassSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  primaryAttributes: z.array(AttributeKeySchema).min(1).max(2),
  savingThrows: z.array(AttributeKeySchema).min(1).max(3),
  focusPerLevel: z.number().int().min(0).max(20),
  focusName: z.string().min(1),
  armorProficiency: z.array(z.enum(["light", "medium", "heavy", "shield"])),
  weaponProficiency: z.array(z.enum(["simple", "martial", "ranged", "finesse"])),
  startingAbilityIds: z.array(ContentIdSchema).min(1),
  startingItemIds: z.array(ContentIdSchema).default([]),
  skillChoices: z.array(z.string()).default([]),
  skillChoiceCount: z.number().int().min(0).max(4).default(2),
  playable: z.boolean().default(true),
});
export type CharacterClass = z.infer<typeof CharacterClassSchema>;

export const BackgroundSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  skillIds: z.array(z.string()).min(1).max(3),
  toolOrLanguage: z.string().min(1),
  startingItemIds: z.array(ContentIdSchema),
  hook: z.string().min(1),
  playable: z.boolean().default(true),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const ConditionIdSchema = z.string().min(1).max(80);

export const AbilitySchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tier: z.number().int().min(1).max(10),
  cost: z.number().int().min(0).max(20).default(0),
  cooldown: z.number().int().min(0).max(20).default(0),
  targeting: z.enum(["self", "single", "cone", "line", "burst", "aura"]),
  rangeHexes: z.number().int().min(0).max(30),
  effects: z.array(z.record(z.string(), z.unknown())),
  tags: z.array(z.string()).default([]),
});
export type Ability = z.infer<typeof AbilitySchema>;

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
