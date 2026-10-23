import type { Ability, Ancestry, Background, CharacterClass, Item } from "@iwakura/contracts";

export * from "./appearance.js";
export * from "./terrains.js";
export * from "./worlds.js";

export const CONTENT_VERSION = "0.1.0";

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

export const ABILITIES: Ability[] = [
  {
    id: "core:power_strike",
    name: "Power Strike",
    description: "A committed melee attack. Costs 2 Focus and deals weapon damage plus 1d6.",
    tier: 1,
    cost: 2,
    cooldown: 0,
    targeting: "single",
    rangeHexes: 1,
    effects: [
      { kind: "damage", dice: "1d6", damageType: "physical" },
      { kind: "condition", conditionId: "prone", duration: 1, save: "str", dc: 12 },
    ],
    tags: ["melee", "fighter"],
  },
  {
    id: "core:second_wind",
    name: "Second Wind",
    description: "Draw on reserves to recover 1d10 + level hit points.",
    tier: 1,
    cost: 0,
    cooldown: 3,
    targeting: "self",
    rangeHexes: 0,
    effects: [{ kind: "heal", dice: "1d10", addLevel: true }],
    tags: ["martial", "fighter", "recovery"],
  },
  {
    id: "core:sneak_attack",
    name: "Sneak Attack",
    description: "Strike a distracted foe for an extra 1d6 damage per two levels.",
    tier: 1,
    cost: 1,
    cooldown: 0,
    targeting: "single",
    rangeHexes: 1,
    effects: [{ kind: "damage", dice: "1d6", scaling: "level_div_2", damageType: "physical" }],
    tags: ["melee", "rogue"],
  },
  {
    id: "core:cunning_action",
    name: "Cunning Action",
    description: "Dash, disengage, or hide as a bonus action.",
    tier: 1,
    cost: 1,
    cooldown: 0,
    targeting: "self",
    rangeHexes: 0,
    effects: [{ kind: "movement", mode: "dash_or_disengage" }],
    tags: ["rogue", "utility"],
  },
  {
    id: "core:firebolt",
    name: "Firebolt",
    description: "Hurl a mote of flame at a target within 12 hexes for 1d10 fire damage.",
    tier: 1,
    cost: 2,
    cooldown: 0,
    targeting: "single",
    rangeHexes: 12,
    effects: [{ kind: "damage", dice: "1d10", damageType: "fire" }],
    tags: ["spell", "wizard", "fire"],
  },
  {
    id: "core:shield",
    name: "Shield",
    description: "Raise a barrier of force, gaining +5 AC until the start of your next turn.",
    tier: 1,
    cost: 1,
    cooldown: 0,
    targeting: "self",
    rangeHexes: 0,
    effects: [{ kind: "modifier", target: "ac", value: 5, duration: 1 }],
    tags: ["spell", "wizard", "defense"],
  },
  {
    id: "core:minor_heal",
    name: "Mend Wounds",
    description: "Restore 1d8 + spellcasting modifier hit points to a creature within 2 hexes.",
    tier: 1,
    cost: 2,
    cooldown: 0,
    targeting: "single",
    rangeHexes: 2,
    effects: [{ kind: "heal", dice: "1d8", addAttribute: "wis" }],
    tags: ["spell", "cleric", "healing"],
  },
];

export const ANCESTRIES: Ancestry[] = [
  {
    id: "core:human",
    name: "Human",
    description: "Adaptable, ambitious, and at home in every corner of the world.",
    bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    traits: [
      {
        id: "core:human_resolve",
        name: "Human Resolve",
        description: "Once per long rest, reroll a failed save.",
      },
      {
        id: "core:human_versatility",
        name: "Versatility",
        description: "Gain proficiency in one additional skill.",
      },
    ],
    movement: 6,
    grantedSkillIds: [],
    extraSkillChoices: 1,
    playable: true,
  },
  {
    id: "core:elf",
    name: "Elf",
    description: "Long-lived wanderers with sharp senses and an old bond to the wild.",
    bonuses: { dex: 2, wis: 1 },
    traits: [
      {
        id: "core:darkvision",
        name: "Darkvision",
        description: "See in dim light within 12 hexes as if it were bright light.",
      },
      { id: "core:keen_senses", name: "Keen Senses", description: "Proficiency in Perception." },
      {
        id: "core:fey_ancestry",
        name: "Fey Ancestry",
        description: "Advantage against being charmed; magic cannot put you to sleep.",
      },
    ],
    movement: 6,
    grantedSkillIds: ["perception"],
    extraSkillChoices: 0,
    playable: true,
  },
  {
    id: "core:dwarf",
    name: "Dwarf",
    description: "Stone-hard folk of the deep roads, slow to trust and slower to yield.",
    bonuses: { con: 2, wis: 1 },
    traits: [
      {
        id: "core:darkvision",
        name: "Darkvision",
        description: "See in dim light within 12 hexes as if it were bright light.",
      },
      {
        id: "core:dwarven_resilience",
        name: "Dwarven Resilience",
        description: "Advantage on saves against poison; resistance to poison damage.",
      },
      {
        id: "core:stonecunning",
        name: "Stonecunning",
        description: "Double proficiency on History checks about stonework.",
      },
    ],
    movement: 5,
    grantedSkillIds: [],
    extraSkillChoices: 0,
    playable: true,
  },
];

export const CLASSES: CharacterClass[] = [
  {
    id: "core:fighter",
    name: "Fighter",
    description: "A disciplined combatant who wins through steel, stamina, and positioning.",
    hitDie: 10,
    primaryAttributes: ["str", "con"],
    savingThrows: ["str", "con"],
    focusPerLevel: 3,
    focusName: "Stamina",
    armorProficiency: ["light", "medium", "heavy", "shield"],
    weaponProficiency: ["simple", "martial"],
    startingAbilityIds: ["core:power_strike", "core:second_wind"],
    startingItemIds: ["core:longsword", "core:leather_armor"],
    skillChoices: ["athletics", "intimidation", "survival", "perception"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:rogue",
    name: "Rogue",
    description: "A precise opportunist who turns positioning and nerve into lethal advantage.",
    hitDie: 8,
    primaryAttributes: ["dex", "cha"],
    savingThrows: ["dex", "int"],
    focusPerLevel: 2,
    focusName: "Guile",
    armorProficiency: ["light"],
    weaponProficiency: ["simple", "finesse", "ranged"],
    startingAbilityIds: ["core:sneak_attack", "core:cunning_action"],
    startingItemIds: ["core:dagger", "core:leather_armor"],
    skillChoices: ["stealth", "sleight_of_hand", "deception", "investigation"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:wizard",
    name: "Wizard",
    description: "A scholar of the arcane who bends the battlefield with prepared spells.",
    hitDie: 6,
    primaryAttributes: ["int", "wis"],
    savingThrows: ["int", "wis"],
    focusPerLevel: 4,
    focusName: "Mana",
    armorProficiency: [],
    weaponProficiency: ["simple"],
    startingAbilityIds: ["core:firebolt", "core:shield"],
    startingItemIds: ["core:staff", "core:healing_potion"],
    skillChoices: ["arcana", "history", "investigation", "insight"],
    skillChoiceCount: 2,
    playable: true,
  },
];

export const BACKGROUNDS: Background[] = [
  {
    id: "core:soldier",
    name: "Soldier",
    description: "You served in a company that no longer exists. The drills stayed.",
    skillIds: ["athletics", "intimidation"],
    toolOrLanguage: "Gaming set",
    startingItemIds: ["core:longsword", "core:leather_armor"],
    hook: "A former comrade has gone missing near the frontier.",
    playable: true,
  },
  {
    id: "core:scholar",
    name: "Scholar",
    description: "You spent years among books and ruins. Some questions should have stayed buried.",
    skillIds: ["arcana", "history"],
    toolOrLanguage: "One language",
    startingItemIds: ["core:staff", "core:healing_potion"],
    hook: "A fragment of an old text points to a place that should not exist.",
    playable: true,
  },
  {
    id: "core:outlander",
    name: "Outlander",
    description: "You grew up beyond the roads, where weather is a teacher and hunger is honest.",
    skillIds: ["survival", "perception"],
    toolOrLanguage: "One language",
    startingItemIds: ["core:dagger", "core:leather_armor"],
    hook: "Something has driven the wild things out of their usual grounds.",
    playable: true,
  },
];

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
    id: "core:healing_potion",
    name: "Healing Potion",
    description: "A bitter red draught. Restores 2d4 + 2 hit points.",
    kind: "consumable",
    rarity: "common",
    valueGold: 50,
    stackable: true,
    stats: { heal: "2d4+2" },
  },
];

export function getAncestry(id: string): Ancestry | undefined {
  return ANCESTRIES.find((entry) => entry.id === id);
}

export function getClass(id: string): CharacterClass | undefined {
  return CLASSES.find((entry) => entry.id === id);
}

export function getBackground(id: string): Background | undefined {
  return BACKGROUNDS.find((entry) => entry.id === id);
}

export function getAbility(id: string): Ability | undefined {
  return ABILITIES.find((entry) => entry.id === id);
}

export function getSkill(id: string): (typeof SKILLS)[number] | undefined {
  return SKILLS.find((entry) => entry.id === id);
}

export function getItem(id: string): Item | undefined {
  return ITEMS.find((entry) => entry.id === id);
}

export const CONTENT = {
  version: CONTENT_VERSION,
  ancestries: ANCESTRIES,
  classes: CLASSES,
  backgrounds: BACKGROUNDS,
  abilities: ABILITIES,
  items: ITEMS,
  skills: SKILLS,
} as const;
