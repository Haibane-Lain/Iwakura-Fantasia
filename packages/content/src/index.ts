import type { EnemyDefinition, FactionDefinition, Item } from "@iwakura/contracts";
import { ABILITIES, CONDITIONS, FEATS, SUBCLASSES, TALENT_TREES } from "./abilities.js";
import { ANCESTRIES, BACKGROUNDS, CLASSES, LANGUAGES, TOOLS } from "./characters.js";

export * from "./abilities.js";
export * from "./appearance.js";
export * from "./characters.js";
export * from "./local.js";
export * from "./terrains.js";
export * from "./worlds.js";

export const CONTENT_VERSION = "0.2.0";

export const SKILLS = [
  { id: "acrobatics", name: "Acrobatics", attribute: "dex" },
  { id: "animal_handling", name: "Animal Handling", attribute: "wis" },
  { id: "arcana", name: "Arcana", attribute: "int" },
  { id: "athletics", name: "Athletics", attribute: "str" },
  { id: "deception", name: "Deception", attribute: "cha" },
  { id: "history", name: "History", attribute: "int" },
  { id: "insight", name: "Insight", attribute: "wis" },
  { id: "intimidation", name: "Intimidation", attribute: "cha" },
  { id: "investigation", name: "Investigation", attribute: "int" },
  { id: "medicine", name: "Medicine", attribute: "wis" },
  { id: "nature", name: "Nature", attribute: "int" },
  { id: "perception", name: "Perception", attribute: "wis" },
  { id: "performance", name: "Performance", attribute: "cha" },
  { id: "persuasion", name: "Persuasion", attribute: "cha" },
  { id: "religion", name: "Religion", attribute: "int" },
  { id: "sleight_of_hand", name: "Sleight of Hand", attribute: "dex" },
  { id: "stealth", name: "Stealth", attribute: "dex" },
  { id: "survival", name: "Survival", attribute: "wis" },
] as const;

export type SkillId = (typeof SKILLS)[number]["id"];

export const ITEMS: Item[] = [
  {
    id: "core:longsword",
    name: "Longsword",
    description: "A balanced blade with a worn leather grip.",
    kind: "weapon",
    rarity: "common",
    valueGold: 15,
    stackable: false,
    stats: { damage: "1d8", damageType: "slashing", properties: ["versatile"] },
  },
  {
    id: "core:greatsword",
    name: "Greatsword",
    description: "A long argument with a heavy conclusion.",
    kind: "weapon",
    rarity: "common",
    valueGold: 30,
    stackable: false,
    stats: { damage: "2d6", damageType: "slashing", properties: ["two-handed", "heavy"] },
  },
  {
    id: "core:dagger",
    name: "Dagger",
    description: "Short, quick, and easy to hide.",
    kind: "weapon",
    rarity: "common",
    valueGold: 2,
    stackable: false,
    stats: { damage: "1d4", damageType: "piercing", properties: ["finesse", "thrown", "light"] },
  },
  {
    id: "core:shortbow",
    name: "Shortbow",
    description: "A hunter's bow, light enough to use in bad country.",
    kind: "weapon",
    rarity: "common",
    valueGold: 25,
    stackable: false,
    stats: { damage: "1d6", damageType: "piercing", properties: ["ranged", "two-handed"] },
  },
  {
    id: "core:mace",
    name: "Mace",
    description: "A heavy head on a short haft. It does not need an edge.",
    kind: "weapon",
    rarity: "common",
    valueGold: 5,
    stackable: false,
    stats: { damage: "1d6", damageType: "bludgeoning", properties: ["simple"] },
  },
  {
    id: "core:staff",
    name: "Ash Staff",
    description: "A spellcaster's staff, warm to the touch.",
    kind: "weapon",
    rarity: "common",
    valueGold: 5,
    stackable: false,
    stats: { damage: "1d6", damageType: "bludgeoning", properties: ["focus"] },
  },
  {
    id: "core:leather_armor",
    name: "Leather Armor",
    description: "Supple leather reinforced at the seams.",
    kind: "armor",
    rarity: "common",
    valueGold: 10,
    stackable: false,
    stats: { ac: 11, armorType: "light" },
  },
  {
    id: "core:scale_mail",
    name: "Scale Mail",
    description: "Overlapping plates that make a serious point about standing still.",
    kind: "armor",
    rarity: "common",
    valueGold: 50,
    stackable: false,
    stats: { ac: 14, armorType: "medium" },
  },
  {
    id: "core:wooden_shield",
    name: "Wooden Shield",
    description: "A round shield of banded oak. It has stopped worse than you.",
    kind: "shield",
    rarity: "common",
    valueGold: 10,
    stackable: false,
    stats: { ac: 2, shield: true },
  },
  {
    id: "core:healing_potion",
    name: "Healing Potion",
    description: "A bitter red draught. Restores 2d4 + 2 hit points.",
    kind: "consumable",
    rarity: "common",
    valueGold: 50,
    stackable: true,
    stats: { heal: "2d4+2" },
  },
  {
    id: "core:torch",
    name: "Torch",
    description: "Pitch-soaked reed wrapped in cloth. Burns for a few hours and makes a poor club.",
    kind: "consumable",
    rarity: "common",
    valueGold: 1,
    stackable: true,
    stats: { light: 6 },
  },
  {
    id: "core:rope",
    name: "Hemp Rope",
    description: "Thirty feet of good rope. Useful for almost everything except keeping secrets.",
    kind: "tool",
    rarity: "common",
    valueGold: 2,
    stackable: false,
    stats: { lengthFeet: 30 },
  },
  {
    id: "core:rations",
    name: "Trail Rations",
    description: "Hard bread, dried fish, and a wedge of cheese that has seen better days.",
    kind: "consumable",
    rarity: "common",
    valueGold: 1,
    stackable: true,
    stats: { days: 1 },
  },
  {
    id: "core:thieves_tools",
    name: "Thieves' Tools",
    description: "Picks, files, and a small mirror for doors that should have stayed closed.",
    kind: "tool",
    rarity: "common",
    valueGold: 25,
    stackable: false,
    stats: { tool: "thieves_tools" },
  },
  {
    id: "core:iron_key",
    name: "Iron Key",
    description: "A heavy key with a spiral cut into its bow. It fits no door in Redford.",
    kind: "treasure",
    rarity: "uncommon",
    valueGold: 8,
    stackable: false,
    stats: { questHint: "crypt" },
  },
  {
    id: "core:silver_locket",
    name: "Silver Locket",
    description: "A plain locket, warm from a pocket. Inside is a pressed sprig of river mint.",
    kind: "treasure",
    rarity: "uncommon",
    valueGold: 30,
    stackable: false,
    stats: { keepsake: true },
  },
  {
    id: "core:mills_ledger",
    name: "Mill Ledger",
    description: "Hessa's missing ledger. The last entries name four men and a debt that is not money.",
    kind: "quest",
    rarity: "rare",
    valueGold: 0,
    stackable: false,
    stats: { quest: "core:the_stopped_mill" },
  },
];

export function getSkill(id: string): (typeof SKILLS)[number] | undefined {
  return SKILLS.find((entry) => entry.id === id);
}

export function getItem(id: string): Item | undefined {
  return ITEMS.find((entry) => entry.id === id);
}

export const ENEMIES: EnemyDefinition[] = [
  {
    id: "core:bandit",
    name: "Road bandit",
    description: "A hungry opportunist with a notched blade and a short temper.",
    hp: 8,
    ac: 12,
    speed: 6,
    attackBonus: 3,
    damageDice: "1d6",
    damageBonus: 1,
    range: 1,
    initiativeBonus: 1,
    gold: 7,
    palette: "ember",
    tags: ["humanoid", "road"],
  },
  {
    id: "core:wolf",
    name: "Grey wolf",
    description: "Lean, patient, and faster than it has any right to be.",
    hp: 6,
    ac: 11,
    speed: 7,
    attackBonus: 3,
    damageDice: "1d6",
    damageBonus: 1,
    range: 1,
    initiativeBonus: 2,
    gold: 0,
    palette: "ink",
    tags: ["beast", "road"],
  },
  {
    id: "core:crypt_shade",
    name: "Crypt shade",
    description: "A smear of cold intent that remembers being someone.",
    hp: 5,
    ac: 10,
    speed: 5,
    attackBonus: 2,
    damageDice: "1d4",
    damageBonus: 0,
    range: 1,
    initiativeBonus: 0,
    gold: 0,
    palette: "frost",
    tags: ["undead", "crypt"],
  },
];

export function getEnemy(id: string): EnemyDefinition | undefined {
  return ENEMIES.find((entry) => entry.id === id);
}

export const FACTIONS: FactionDefinition[] = [
  {
    id: "core:redford_watch",
    name: "Redford Watch",
    description: "The gate guard and road patrols of Redford. They value quiet roads and clean reports.",
  },
  {
    id: "core:millers_compact",
    name: "Millers' Compact",
    description: "The millers and river traders who keep the valley fed. They remember debts and favors.",
  },
  {
    id: "core:greywatch_circle",
    name: "Greywatch Circle",
    description: "A quiet circle of scholars and wardens who tend the old seals under the hills.",
  },
];

export function getFaction(id: string): FactionDefinition | undefined {
  return FACTIONS.find((entry) => entry.id === id);
}

export const CONTENT = {
  version: CONTENT_VERSION,
  ancestries: ANCESTRIES,
  classes: CLASSES,
  backgrounds: BACKGROUNDS,
  abilities: ABILITIES,
  conditions: CONDITIONS,
  talentTrees: TALENT_TREES,
  subclasses: SUBCLASSES,
  feats: FEATS,
  items: ITEMS,
  skills: SKILLS,
  tools: TOOLS,
  languages: LANGUAGES,
} as const;
