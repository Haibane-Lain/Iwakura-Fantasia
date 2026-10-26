import {
  type Ancestry,
  type AncestryInput,
  AncestrySchema,
  type Background,
  type BackgroundInput,
  BackgroundSchema,
  type CharacterClass,
  type CharacterClassInput,
  CharacterClassSchema,
} from "@iwakura/contracts";

export const TOOLS = [
  { id: "thieves_tools", name: "Thieves' Tools" },
  { id: "smiths_tools", name: "Smith's Tools" },
  { id: "herbalism_kit", name: "Herbalism Kit" },
  { id: "gaming_set", name: "Gaming Set" },
  { id: "musical_instrument", name: "Musical Instrument" },
  { id: "navigators_tools", name: "Navigator's Tools" },
  { id: "disguise_kit", name: "Disguise Kit" },
  { id: "alchemists_supplies", name: "Alchemist's Supplies" },
] as const;

export const LANGUAGES = [
  { id: "elvish", name: "Elvish" },
  { id: "dwarvish", name: "Dwarvish" },
  { id: "orcish", name: "Orcish" },
  { id: "halfling", name: "Halfling" },
  { id: "beast_speech", name: "Beast Speech" },
  { id: "infernal", name: "Infernal" },
  { id: "celestial", name: "Celestial" },
  { id: "draconic", name: "Draconic" },
] as const;

const ANCESTRY_DATA: AncestryInput[] = [
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
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
      {
        id: "core:human_versatility",
        name: "Versatility",
        description: "Gain proficiency in one additional skill.",
        effects: [],
      },
    ],
    movement: 6,
    grantedSkillIds: [],
    extraSkillChoices: 1,
    heritages: [
      {
        id: "core:heritage_cosmopolitan",
        name: "Cosmopolitan",
        description: "You learned the customs of a dozen roads before you learned to fight.",
        bonuses: { cha: 1 },
        traits: [
          {
            id: "core:heritage_cosmopolitan_trait",
            name: "Well Travelled",
            description: "You are at home in markets, courts, and caravans.",
            effects: [{ kind: "stat", stat: "skill", skillId: "persuasion", value: 1 }],
          },
        ],
      },
      {
        id: "core:heritage_frontier",
        name: "Frontier",
        description: "You were raised where the map runs out and the weather has opinions.",
        bonuses: { con: 1 },
        traits: [
          {
            id: "core:heritage_frontier_trait",
            name: "Weatherwise",
            description: "You read ground and sky before they turn dangerous.",
            effects: [{ kind: "stat", stat: "skill", skillId: "survival", value: 1 }],
          },
        ],
      },
    ],
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
        effects: [{ kind: "stat", stat: "skill", skillId: "perception", value: 1 }],
      },
      {
        id: "core:keen_senses",
        name: "Keen Senses",
        description: "Proficiency in Perception.",
        effects: [{ kind: "skill_proficiency", skillId: "perception" }],
      },
      {
        id: "core:fey_ancestry",
        name: "Fey Ancestry",
        description: "Advantage against being charmed; magic cannot put you to sleep.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
    ],
    movement: 6,
    grantedSkillIds: ["perception"],
    extraSkillChoices: 0,
    heritages: [
      {
        id: "core:heritage_high_elf",
        name: "High Elf",
        description: "Your people kept the old towers and the older grammar.",
        bonuses: { int: 1 },
        traits: [
          {
            id: "core:heritage_high_elf_trait",
            name: "Cantrip",
            description: "You know a fragment of arcane fire by heart.",
            effects: [{ kind: "grant_ability", abilityId: "core:firebolt" }],
          },
        ],
      },
      {
        id: "core:heritage_wood_elf",
        name: "Wood Elf",
        description: "The forest is a house with no doors and many rooms.",
        bonuses: { wis: 1 },
        traits: [
          {
            id: "core:heritage_wood_elf_trait",
            name: "Fleet of Foot",
            description: "You move through cover without losing your stride.",
            effects: [{ kind: "stat", stat: "speed", value: 1 }],
          },
        ],
      },
    ],
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
        effects: [{ kind: "stat", stat: "skill", skillId: "perception", value: 1 }],
      },
      {
        id: "core:dwarven_resilience",
        name: "Dwarven Resilience",
        description: "Advantage on saves against poison; resistance to poison damage.",
        effects: [{ kind: "resistance", damageType: "poison" }],
      },
      {
        id: "core:stonecunning",
        name: "Stonecunning",
        description: "Double proficiency on History checks about stonework.",
        effects: [{ kind: "stat", stat: "skill", skillId: "history", value: 2 }],
      },
    ],
    movement: 5,
    grantedSkillIds: [],
    extraSkillChoices: 0,
    heritages: [
      {
        id: "core:heritage_hill_dwarf",
        name: "Hill Dwarf",
        description: "You grew up beneath open sky and learned to endure.",
        bonuses: { wis: 1 },
        traits: [
          {
            id: "core:heritage_hill_dwarf_trait",
            name: "Dwarven Toughness",
            description: "Your reserves run deeper than they should.",
            effects: [{ kind: "stat", stat: "max_hp_per_level", value: 1 }],
          },
        ],
      },
      {
        id: "core:heritage_deep_dwarf",
        name: "Deep Dwarf",
        description: "The dark roads shaped your shoulders and your patience.",
        bonuses: { str: 1 },
        traits: [
          {
            id: "core:heritage_deep_dwarf_trait",
            name: "Deep Warder",
            description: "You brace against the things that live below.",
            effects: [{ kind: "stat", stat: "ac", value: 1 }],
          },
        ],
      },
    ],
    playable: true,
  },
  {
    id: "core:orc",
    name: "Orc",
    description: "A people of hard country, loud loyalty, and a refusal to stay down.",
    bonuses: { str: 2, con: 1 },
    traits: [
      {
        id: "core:orc_relentless",
        name: "Relentless",
        description: "When the blow should have finished you, you take one more step.",
        effects: [{ kind: "stat", stat: "max_hp_per_level", value: 1 }],
      },
      {
        id: "core:orc_powerful_build",
        name: "Powerful Build",
        description: "You carry more, climb farther, and shove harder.",
        effects: [{ kind: "stat", stat: "skill", skillId: "athletics", value: 1 }],
      },
    ],
    movement: 6,
    grantedSkillIds: [],
    extraSkillChoices: 0,
    heritages: [
      {
        id: "core:heritage_ash_orc",
        name: "Ash Orc",
        description: "Born on the volcanic march, where every lesson is shouted.",
        bonuses: { dex: 1 },
        traits: [
          {
            id: "core:heritage_ash_orc_trait",
            name: "Ashborn",
            description: "You are hard to frighten and harder to move.",
            effects: [{ kind: "stat", stat: "skill", skillId: "intimidation", value: 1 }],
          },
        ],
      },
      {
        id: "core:heritage_stone_orc",
        name: "Stone Orc",
        description: "The mountain clans measure a person by what they can carry.",
        bonuses: { con: 1 },
        traits: [
          {
            id: "core:heritage_stone_orc_trait",
            name: "Stonehide",
            description: "Old scars have become something like armour.",
            effects: [{ kind: "stat", stat: "ac", value: 1 }],
          },
        ],
      },
    ],
    playable: true,
  },
  {
    id: "core:beastkin",
    name: "Beastkin",
    description: "Kin to the wild things, with senses that remember a different shape.",
    bonuses: { dex: 2, wis: 1 },
    traits: [
      {
        id: "core:beastkin_keen_senses",
        name: "Keen Senses",
        description: "Your ears and nose find what eyes miss.",
        effects: [
          { kind: "skill_proficiency", skillId: "perception" },
          { kind: "stat", stat: "skill", skillId: "survival", value: 1 },
        ],
      },
      {
        id: "core:beastkin_natural_weapons",
        name: "Natural Weapons",
        description: "Claws and fangs are never far away.",
        effects: [{ kind: "grant_ability", abilityId: "core:claw" }],
      },
    ],
    movement: 7,
    grantedSkillIds: ["perception"],
    extraSkillChoices: 0,
    heritages: [
      {
        id: "core:heritage_wolfkin",
        name: "Wolfkin",
        description: "You belong to the long run and the pack's edge.",
        bonuses: { con: 1 },
        traits: [
          {
            id: "core:heritage_wolfkin_trait",
            name: "Pack Runner",
            description: "You keep pace when others fall behind.",
            effects: [{ kind: "stat", stat: "speed", value: 1 }],
          },
        ],
      },
      {
        id: "core:heritage_foxkin",
        name: "Foxkin",
        description: "You learned early that the best answer is often a better angle.",
        bonuses: { cha: 1 },
        traits: [
          {
            id: "core:heritage_foxkin_trait",
            name: "Sly",
            description: "You are very good at being somewhere else.",
            effects: [{ kind: "stat", stat: "skill", skillId: "stealth", value: 1 }],
          },
        ],
      },
    ],
    playable: true,
  },
  {
    id: "core:halfling",
    name: "Halfling",
    description: "Small, stubborn, and unfairly difficult to catch.",
    bonuses: { dex: 2, cha: 1 },
    traits: [
      {
        id: "core:halfling_lucky",
        name: "Lucky",
        description: "The world has a habit of giving you one more chance.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
      {
        id: "core:halfling_nimble",
        name: "Nimble",
        description: "You slip through spaces that should not fit you.",
        effects: [{ kind: "stat", stat: "skill", skillId: "acrobatics", value: 1 }],
      },
    ],
    movement: 5,
    grantedSkillIds: [],
    extraSkillChoices: 0,
    heritages: [
      {
        id: "core:heritage_river_halfling",
        name: "River Halfling",
        description: "You grew up on flatboats and borrowed docks.",
        bonuses: { wis: 1 },
        traits: [
          {
            id: "core:heritage_river_halfling_trait",
            name: "Riverwise",
            description: "You read currents, weather, and people.",
            effects: [{ kind: "stat", stat: "skill", skillId: "insight", value: 1 }],
          },
        ],
      },
      {
        id: "core:heritage_hill_halfling",
        name: "Hill Halfling",
        description: "Your people keep cellars, stories, and grudges for a long time.",
        bonuses: { con: 1 },
        traits: [
          {
            id: "core:heritage_hill_halfling_trait",
            name: "Stout",
            description: "You are harder to knock over than you look.",
            effects: [{ kind: "stat", stat: "max_hp_per_level", value: 1 }],
          },
        ],
      },
    ],
    playable: true,
  },
];

const CLASS_DATA: CharacterClassInput[] = [
  {
    id: "core:fighter",
    name: "Fighter",
    description: "A disciplined combatant who wins through steel, stamina, and positioning.",
    role: "martial",
    complexity: "simple",
    playstyle: "Hold the line, control the melee, and outlast the enemy.",
    hitDie: 10,
    primaryAttributes: ["str", "con"],
    spellAttribute: "str",
    savingThrows: ["str", "con"],
    focusPerLevel: 3,
    focusGainPerLevel: 1,
    focusName: "Stamina",
    armorProficiency: ["light", "medium", "heavy", "shield"],
    weaponProficiency: ["simple", "martial"],
    startingAbilityIds: ["core:power_strike", "core:second_wind", "core:cleave"],
    startingItemIds: ["core:longsword", "core:leather_armor"],
    startingKits: [
      {
        id: "core:kit_fighter_guard",
        name: "Sword and Board",
        description: "A balanced blade, a shield, and armour that has already survived a few arguments.",
        itemIds: ["core:longsword", "core:wooden_shield", "core:leather_armor"],
      },
      {
        id: "core:kit_fighter_vanguard",
        name: "Vanguard",
        description: "Trade the shield for reach and a heavier blade.",
        itemIds: ["core:greatsword", "core:scale_mail"],
      },
    ],
    specialties: [
      {
        id: "core:style_defense",
        name: "Defense",
        description: "Your guard is a habit, not a decision.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        id: "core:style_dueling",
        name: "Dueling",
        description: "A single blade becomes a conversation you always win.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        id: "core:style_great_weapon",
        name: "Great Weapon",
        description: "Commit the whole body to the swing.",
        effects: [{ kind: "stat", stat: "damage", value: 2 }],
      },
    ],
    subclassLevel: 3,
    subclassIds: ["core:fighter_champion", "core:fighter_warden"],
    talentTreeId: "core:tree_fighter",
    levelFeatures: [
      {
        level: 2,
        name: "Weapon Mastery",
        description: "Your drills have become instinct.",
        effects: [{ kind: "stat", stat: "attack", value: 1 }],
      },
      {
        level: 5,
        name: "Extra Attack",
        description: "You have learned to turn one opening into another.",
        effects: [{ kind: "stat", stat: "damage", value: 2 }],
      },
      {
        level: 7,
        name: "Battle Hardened",
        description: "You read the fight before it reaches you.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        level: 9,
        name: "Indomitable",
        description: "You refuse the ending the enemy wrote for you.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
    ],
    skillChoices: ["athletics", "intimidation", "survival", "perception"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:rogue",
    name: "Rogue",
    description: "A precise opportunist who turns positioning and nerve into lethal advantage.",
    role: "expert",
    complexity: "moderate",
    playstyle: "Strike first, strike last, and never be where the blow lands.",
    hitDie: 8,
    primaryAttributes: ["dex", "cha"],
    spellAttribute: "dex",
    savingThrows: ["dex", "int"],
    focusPerLevel: 2,
    focusGainPerLevel: 1,
    focusName: "Guile",
    armorProficiency: ["light"],
    weaponProficiency: ["simple", "finesse", "ranged"],
    startingAbilityIds: ["core:sneak_attack", "core:cunning_action", "core:poison_blade"],
    startingItemIds: ["core:dagger", "core:leather_armor"],
    startingKits: [
      {
        id: "core:kit_rogue_shadow",
        name: "Shadow Kit",
        description: "A knife, a bow, and clothes that do not catch the light.",
        itemIds: ["core:dagger", "core:shortbow", "core:leather_armor"],
      },
      {
        id: "core:kit_rogue_thief",
        name: "Thief's Kit",
        description: "Everything you need to open a door that was not yours.",
        itemIds: ["core:dagger", "core:thieves_tools", "core:leather_armor"],
      },
    ],
    specialties: [
      {
        id: "core:specialty_traps",
        name: "Trap Artist",
        description: "Locks and pressure plates are a language you speak fluently.",
        effects: [
          { kind: "tool_proficiency", toolId: "thieves_tools" },
          { kind: "stat", stat: "skill", skillId: "investigation", value: 1 },
        ],
      },
      {
        id: "core:specialty_face",
        name: "Face",
        description: "The best disguise is a name people already trust.",
        effects: [
          { kind: "stat", stat: "skill", skillId: "deception", value: 2 },
          { kind: "stat", stat: "skill", skillId: "persuasion", value: 1 },
        ],
      },
    ],
    subclassLevel: 3,
    subclassIds: ["core:rogue_thief", "core:rogue_assassin"],
    talentTreeId: "core:tree_rogue",
    levelFeatures: [
      {
        level: 2,
        name: "Expertise",
        description: "You sharpen the skills you already trust.",
        effects: [{ kind: "stat", stat: "skill", value: 1 }],
      },
      {
        level: 5,
        name: "Uncanny Dodge",
        description: "The blow arrives; you are already elsewhere.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        level: 7,
        name: "Evasion",
        description: "Danger is a room you leave before it closes.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
      {
        level: 9,
        name: "Reliable Talent",
        description: "Your worst attempt is still better than most people's best.",
        effects: [{ kind: "stat", stat: "skill", value: 1 }],
      },
    ],
    skillChoices: ["stealth", "sleight_of_hand", "deception", "investigation"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:wizard",
    name: "Wizard",
    description: "A scholar of the arcane who bends the battlefield with prepared spells.",
    role: "arcane",
    complexity: "complex",
    playstyle: "Shape the fight from range with prepared answers and careful positioning.",
    hitDie: 6,
    primaryAttributes: ["int", "wis"],
    spellAttribute: "int",
    savingThrows: ["int", "wis"],
    focusPerLevel: 4,
    focusGainPerLevel: 1,
    focusName: "Mana",
    armorProficiency: [],
    weaponProficiency: ["simple"],
    startingAbilityIds: ["core:firebolt", "core:shield", "core:magic_missile"],
    startingItemIds: ["core:staff", "core:healing_potion"],
    startingKits: [
      {
        id: "core:kit_wizard_scholar",
        name: "Scholar's Kit",
        description: "A staff, a potion, and a torch for the places books do not describe.",
        itemIds: ["core:staff", "core:healing_potion", "core:torch"],
      },
      {
        id: "core:kit_wizard_war",
        name: "War Mage's Kit",
        description: "A staff, a knife, and armour that does not pretend to be elegant.",
        itemIds: ["core:staff", "core:dagger", "core:leather_armor"],
      },
    ],
    specialties: [
      {
        id: "core:focus_staff",
        name: "Staff",
        description: "A length of ash that remembers every spell you have spoken through it.",
        effects: [{ kind: "stat", stat: "attack", value: 1 }],
      },
      {
        id: "core:focus_tome",
        name: "Tome",
        description: "Your notes are worth more than most libraries.",
        effects: [
          { kind: "stat", stat: "focus", value: 1 },
          { kind: "stat", stat: "skill", skillId: "arcana", value: 1 },
        ],
      },
      {
        id: "core:focus_orb",
        name: "Orb",
        description: "A small sphere that makes the air feel like it is listening.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
    ],
    subclassLevel: 3,
    subclassIds: ["core:wizard_evoker", "core:wizard_abjurer"],
    talentTreeId: "core:tree_wizard",
    levelFeatures: [
      {
        level: 2,
        name: "Arcane Recovery",
        description: "You have learned how to make a little power go further.",
        effects: [{ kind: "stat", stat: "focus", value: 2 }],
      },
      {
        level: 5,
        name: "Spell Mastery",
        description: "A favourite spell becomes as natural as breathing.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        level: 7,
        name: "Arcane Defense",
        description: "You keep a second ward behind the first.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        level: 9,
        name: "Signature Spell",
        description: "One spell is no longer a tool. It is part of you.",
        effects: [{ kind: "stat", stat: "attack", value: 1 }],
      },
    ],
    skillChoices: ["arcana", "history", "investigation", "insight"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:cleric",
    name: "Cleric",
    description: "A vessel for something older and kinder than the road, or harder than it.",
    role: "divine",
    complexity: "moderate",
    playstyle: "Keep the party standing, punish the reckless, and make the battlefield sacred.",
    hitDie: 8,
    primaryAttributes: ["wis", "con"],
    spellAttribute: "wis",
    savingThrows: ["wis", "cha"],
    focusPerLevel: 3,
    focusGainPerLevel: 1,
    focusName: "Zeal",
    armorProficiency: ["light", "medium", "shield"],
    weaponProficiency: ["simple"],
    startingAbilityIds: ["core:sacred_flame", "core:healing_word", "core:bless"],
    startingItemIds: ["core:mace", "core:leather_armor", "core:healing_potion"],
    startingKits: [
      {
        id: "core:kit_cleric_light",
        name: "Lantern",
        description: "A mace, a potion, and a light that does not care about the dark.",
        itemIds: ["core:mace", "core:leather_armor", "core:healing_potion"],
      },
      {
        id: "core:kit_cleric_war",
        name: "Warpriest",
        description: "A shield and scale for the arguments that cannot be settled with words.",
        itemIds: ["core:mace", "core:wooden_shield", "core:scale_mail"],
      },
    ],
    specialties: [
      {
        id: "core:domain_light",
        name: "Light",
        description: "You carry a fire that makes lies visible.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        id: "core:domain_life",
        name: "Life",
        description: "You are a door through which mercy enters the world.",
        effects: [{ kind: "stat", stat: "focus", value: 2 }],
      },
      {
        id: "core:domain_war",
        name: "War",
        description: "Your god has opinions about the proper use of a mace.",
        effects: [{ kind: "stat", stat: "attack", value: 1 }],
      },
    ],
    subclassLevel: 3,
    subclassIds: ["core:cleric_life", "core:cleric_war"],
    talentTreeId: "core:tree_cleric",
    levelFeatures: [
      {
        level: 2,
        name: "Channel Divinity",
        description: "Your faith becomes a force the battlefield can feel.",
        effects: [{ kind: "stat", stat: "focus", value: 2 }],
      },
      {
        level: 5,
        name: "Divine Strike",
        description: "Your weapon carries a little more than steel.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        level: 7,
        name: "Blessed Defense",
        description: "You stand where the blow was meant to land.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        level: 9,
        name: "Divine Intervention",
        description: "Sometimes the answer is yes.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
    ],
    skillChoices: ["religion", "insight", "medicine", "persuasion"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:ranger",
    name: "Ranger",
    description: "A hunter of the edges, patient enough to follow a trail and cruel enough to end it.",
    role: "primal",
    complexity: "moderate",
    playstyle: "Mark the target, keep your distance, and make every hex count.",
    hitDie: 10,
    primaryAttributes: ["dex", "wis"],
    spellAttribute: "dex",
    savingThrows: ["str", "dex"],
    focusPerLevel: 2,
    focusGainPerLevel: 1,
    focusName: "Grit",
    armorProficiency: ["light", "medium", "shield"],
    weaponProficiency: ["simple", "martial", "ranged"],
    startingAbilityIds: ["core:hunters_mark", "core:piercing_shot", "core:trailcraft"],
    startingItemIds: ["core:shortbow", "core:leather_armor"],
    startingKits: [
      {
        id: "core:kit_ranger_hunter",
        name: "Hunter",
        description: "A bow, a knife, and boots that know when to be quiet.",
        itemIds: ["core:shortbow", "core:dagger", "core:leather_armor"],
      },
      {
        id: "core:kit_ranger_warden",
        name: "Warden",
        description: "A blade and a shield for the trails where the trees are too close for a bow.",
        itemIds: ["core:longsword", "core:wooden_shield", "core:leather_armor"],
      },
    ],
    specialties: [
      {
        id: "core:terrain_forest",
        name: "Forest",
        description: "The canopy tells you where the path will be before the path does.",
        effects: [
          { kind: "stat", stat: "skill", skillId: "survival", value: 2 },
          { kind: "stat", stat: "speed", value: 1 },
        ],
      },
      {
        id: "core:terrain_hills",
        name: "Hills",
        description: "You have learned to read the land like a warning.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        id: "core:terrain_swamp",
        name: "Swamp",
        description: "You know what the water is hiding because you have hidden there too.",
        effects: [{ kind: "resistance", damageType: "poison" }],
      },
    ],
    subclassLevel: 3,
    subclassIds: ["core:ranger_hunter", "core:ranger_trailblazer"],
    talentTreeId: "core:tree_ranger",
    levelFeatures: [
      {
        level: 2,
        name: "Favored Enemy",
        description: "You know where to hit the things that run.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        level: 5,
        name: "Extra Attack",
        description: "One arrow is a warning. Two is a decision.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        level: 7,
        name: "Defensive Tactics",
        description: "The wild does not catch you twice the same way.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        level: 9,
        name: "Nature's Veil",
        description: "The land agrees to keep your secrets.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
    ],
    skillChoices: ["survival", "nature", "perception", "stealth"],
    skillChoiceCount: 2,
    playable: true,
  },
  {
    id: "core:warlock",
    name: "Warlock",
    description: "Someone made a bargain, and the bargain is still listening.",
    role: "occult",
    complexity: "complex",
    playstyle: "Apply pressure from range, mark a target, and spend power you may not own.",
    hitDie: 8,
    primaryAttributes: ["cha", "con"],
    spellAttribute: "cha",
    savingThrows: ["wis", "cha"],
    focusPerLevel: 3,
    focusGainPerLevel: 1,
    focusName: "Pact",
    armorProficiency: ["light"],
    weaponProficiency: ["simple", "finesse"],
    startingAbilityIds: ["core:eldritch_blast", "core:hex", "core:pact_blade"],
    startingItemIds: ["core:staff", "core:leather_armor"],
    startingKits: [
      {
        id: "core:kit_warlock_pact",
        name: "Pact Blade",
        description: "A staff, a knife, and a promise that has not come due yet.",
        itemIds: ["core:staff", "core:dagger", "core:leather_armor"],
      },
      {
        id: "core:kit_warlock_scholar",
        name: "Forbidden Scholar",
        description: "A staff, a potion, and a torch for reading things that should stay shut.",
        itemIds: ["core:staff", "core:healing_potion", "core:torch"],
      },
    ],
    specialties: [
      {
        id: "core:pact_blade_specialty",
        name: "Pact of the Blade",
        description: "Your weapon is a promise with an edge.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        id: "core:pact_tome_specialty",
        name: "Pact of the Tome",
        description: "The book writes back.",
        effects: [
          { kind: "stat", stat: "skill", skillId: "arcana", value: 2 },
          { kind: "stat", stat: "focus", value: 1 },
        ],
      },
      {
        id: "core:pact_talisman_specialty",
        name: "Pact of the Talisman",
        description: "Something answers when you hold it.",
        effects: [{ kind: "stat", stat: "save", value: 1 }],
      },
    ],
    subclassLevel: 3,
    subclassIds: ["core:warlock_fiend", "core:warlock_void"],
    talentTreeId: "core:tree_warlock",
    levelFeatures: [
      {
        level: 2,
        name: "Eldritch Invocations",
        description: "You learn a new way to make the bargain useful.",
        effects: [{ kind: "stat", stat: "focus", value: 2 }],
      },
      {
        level: 5,
        name: "Pact Magic",
        description: "The power comes easier now. That is not always comforting.",
        effects: [{ kind: "stat", stat: "damage", value: 1 }],
      },
      {
        level: 7,
        name: "Fiendish Resilience",
        description: "You have learned to wear the fire.",
        effects: [{ kind: "stat", stat: "ac", value: 1 }],
      },
      {
        level: 9,
        name: "Mystic Arcanum",
        description: "A secret that was never meant for mortal mouths.",
        effects: [{ kind: "stat", stat: "attack", value: 1 }],
      },
    ],
    skillChoices: ["arcana", "deception", "intimidation", "investigation"],
    skillChoiceCount: 2,
    playable: true,
  },
];

const BACKGROUND_DATA: BackgroundInput[] = [
  {
    id: "core:soldier",
    name: "Soldier",
    description: "You served in a company that no longer exists. The drills stayed.",
    skillIds: ["athletics", "intimidation"],
    toolOrLanguage: "Gaming set",
    toolProficiencyIds: ["gaming_set"],
    languageIds: [],
    startingItemIds: ["core:longsword", "core:leather_armor"],
    hook: "A former comrade has gone missing near the frontier.",
    originEffects: [{ kind: "stat", stat: "attack", value: 1 }],
    playable: true,
  },
  {
    id: "core:scholar",
    name: "Scholar",
    description: "You spent years among books and ruins. Some questions should have stayed buried.",
    skillIds: ["arcana", "history"],
    toolOrLanguage: "One language",
    toolProficiencyIds: [],
    languageIds: ["draconic"],
    startingItemIds: ["core:staff", "core:healing_potion"],
    hook: "A fragment of an old text points to a place that should not exist.",
    originEffects: [{ kind: "stat", stat: "skill", skillId: "arcana", value: 1 }],
    playable: true,
  },
  {
    id: "core:outlander",
    name: "Outlander",
    description: "You grew up beyond the roads, where weather is a teacher and hunger is honest.",
    skillIds: ["survival", "perception"],
    toolOrLanguage: "One language",
    toolProficiencyIds: [],
    languageIds: ["beast_speech"],
    startingItemIds: ["core:dagger", "core:leather_armor"],
    hook: "Something has driven the wild things out of their usual grounds.",
    originEffects: [{ kind: "stat", stat: "skill", skillId: "survival", value: 1 }],
    playable: true,
  },
  {
    id: "core:criminal",
    name: "Criminal",
    description: "You know which doors are watched, which are not, and which are worth the risk.",
    skillIds: ["stealth", "deception"],
    toolOrLanguage: "Thieves' tools",
    toolProficiencyIds: ["thieves_tools"],
    languageIds: [],
    startingItemIds: ["core:dagger", "core:leather_armor", "core:torch"],
    hook: "A job went wrong in a way that left someone owing you an explanation.",
    originEffects: [{ kind: "stat", stat: "skill", skillId: "stealth", value: 1 }],
    playable: true,
  },
  {
    id: "core:acolyte",
    name: "Acolyte",
    description: "You learned the names of gods before you learned the names of kings.",
    skillIds: ["insight", "religion"],
    toolOrLanguage: "One language",
    toolProficiencyIds: [],
    languageIds: ["celestial"],
    startingItemIds: ["core:staff", "core:healing_potion", "core:torch"],
    hook: "A prayer you have said a thousand times has started answering differently.",
    originEffects: [{ kind: "stat", stat: "focus", value: 1 }],
    playable: true,
  },
  {
    id: "core:merchant",
    name: "Merchant",
    description: "You have carried ledgers through war camps and learned what people really value.",
    skillIds: ["persuasion", "insight"],
    toolOrLanguage: "Navigator's tools",
    toolProficiencyIds: ["navigators_tools"],
    languageIds: ["elvish"],
    startingItemIds: ["core:dagger", "core:leather_armor", "core:rations"],
    hook: "A shipment has vanished, and the ledger says it was never sent.",
    originEffects: [{ kind: "stat", stat: "skill", skillId: "persuasion", value: 1 }],
    playable: true,
  },
  {
    id: "core:noble",
    name: "Noble",
    description: "You grew up in rooms where a sentence could cost more than a sword.",
    skillIds: ["history", "persuasion"],
    toolOrLanguage: "One language",
    toolProficiencyIds: ["gaming_set"],
    languageIds: ["elvish"],
    startingItemIds: ["core:longsword", "core:leather_armor", "core:silver_locket"],
    hook: "Your family name opens doors, and one of them should have stayed locked.",
    originEffects: [{ kind: "stat", stat: "skill", skillId: "persuasion", value: 1 }],
    playable: true,
  },
];

export const ANCESTRIES: Ancestry[] = ANCESTRY_DATA.map((entry) => AncestrySchema.parse(entry));
export const CLASSES: CharacterClass[] = CLASS_DATA.map((entry) => CharacterClassSchema.parse(entry));
export const BACKGROUNDS: Background[] = BACKGROUND_DATA.map((entry) => BackgroundSchema.parse(entry));

export function getAncestry(id: string): Ancestry | undefined {
  return ANCESTRIES.find((entry) => entry.id === id);
}

export function getClass(id: string): CharacterClass | undefined {
  return CLASSES.find((entry) => entry.id === id);
}

export function getBackground(id: string): Background | undefined {
  return BACKGROUNDS.find((entry) => entry.id === id);
}

export function getHeritage(ancestryId: string, heritageId?: string) {
  if (!heritageId) return undefined;
  return getAncestry(ancestryId)?.heritages.find((entry) => entry.id === heritageId);
}

export function getTool(id: string) {
  return TOOLS.find((entry) => entry.id === id);
}

export function getLanguage(id: string) {
  return LANGUAGES.find((entry) => entry.id === id);
}
