import { z } from "zod";
import { AttributeKeySchema, AttributesSchema, ConditionIdSchema, ContentIdSchema } from "./content.js";
import { LocalMapKindSchema } from "./local.js";

export const SAVE_VERSION = 1;

export const HexSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
});
export type Hex = z.infer<typeof HexSchema>;

export const WorldSourceSchema = z.enum(["handcrafted", "procedural"]);
export type WorldSource = z.infer<typeof WorldSourceSchema>;

export const DifficultySchema = z.enum(["story", "normal", "hard"]);
export const ContentRatingSchema = z.enum(["teen", "mature"]);

export const WorldGenParamsSchema = z.object({
  width: z.number().int().min(32).max(256).default(128),
  height: z.number().int().min(32).max(256).default(128),
  seaLevel: z.number().min(0).max(1).default(0.42),
  climate: z.enum(["temperate", "cold", "warm", "varied"]).default("varied"),
  magicLevel: z.enum(["low", "standard", "high"]).default("standard"),
  danger: z.enum(["peaceful", "normal", "deadly"]).default("normal"),
  settlementDensity: z.number().min(0).max(1).default(0.5),
});
export type WorldGenParams = z.infer<typeof WorldGenParamsSchema>;

export const CampaignSettingsSchema = z.object({
  worldSource: WorldSourceSchema,
  worldPackId: z.string().optional(),
  seed: z.string().min(1).max(80),
  genParams: WorldGenParamsSchema.prefault({}),
  difficulty: DifficultySchema.default("normal"),
  contentRating: ContentRatingSchema.default("teen"),
  aiEnabled: z.boolean().default(true),
});
export type CampaignSettings = z.infer<typeof CampaignSettingsSchema>;

export const CampaignMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  settings: CampaignSettingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  playtimeSeconds: z.number().int().min(0).default(0),
});
export type CampaignMeta = z.infer<typeof CampaignMetaSchema>;

export const PointOfInterestSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["town", "village", "dungeon", "ruin", "shrine", "camp", "landmark"]),
  name: z.string().min(1),
  hex: HexSchema,
  discovered: z.boolean().default(false),
  worldPackId: z.string().optional(),
  description: z.string().max(2000).default(""),
  size: z.enum(["hamlet", "village", "town", "city"]).optional(),
  levelBand: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).optional(),
});
export type PointOfInterest = z.infer<typeof PointOfInterestSchema>;

export const WorldStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: WorldSourceSchema,
  packId: z.string().optional(),
  seed: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Row-major terrain (biome) IDs. Empty until worldgen has run. */
  terrain: z.array(z.string()).default([]),
  /** Row-major elevation, moisture, and temperature fields in [0, 1]. */
  elevation: z.array(z.number()).default([]),
  moisture: z.array(z.number()).default([]),
  temperature: z.array(z.number()).default([]),
  /** Row-major overlays. 1 means the hex carries the overlay. */
  river: z.array(z.number().int().min(0).max(1)).default([]),
  road: z.array(z.number().int().min(0).max(1)).default([]),
  pois: z.array(PointOfInterestSchema).default([]),
  /** Row-major exploration state (0 unexplored, 1 explored, 2 visible). */
  fog: z.array(z.number().int().min(0).max(2)).default([]),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

export const WorldIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  hex: HexSchema.optional(),
});
export type WorldIssue = z.infer<typeof WorldIssueSchema>;

export const WorldReportSchema = z.object({
  seed: z.string().min(1),
  elapsedMs: z.number().min(0),
  passed: z.boolean(),
  errors: z.array(WorldIssueSchema).default([]),
  warnings: z.array(WorldIssueSchema).default([]),
  stats: z.object({
    landTiles: z.number().int().min(0),
    waterTiles: z.number().int().min(0),
    settlements: z.number().int().min(0),
    dungeons: z.number().int().min(0),
    rivers: z.number().int().min(0),
    roads: z.number().int().min(0),
    biomes: z.record(z.string(), z.number()),
  }),
});
export type WorldReport = z.infer<typeof WorldReportSchema>;

export const WorldGenRequestSchema = z.object({
  source: WorldSourceSchema,
  seed: z.string().min(1).max(80),
  params: WorldGenParamsSchema.optional(),
  packId: z.string().optional(),
});
export type WorldGenRequest = z.infer<typeof WorldGenRequestSchema>;

export const WorldGenResultSchema = z.object({
  world: WorldStateSchema,
  report: WorldReportSchema,
});
export type WorldGenResult = z.infer<typeof WorldGenResultSchema>;

export const HandcraftedWorldPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Rows of terrain symbols, one character per hex. */
  rows: z.array(z.string()).min(1),
  pois: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["town", "village", "dungeon", "ruin", "shrine", "camp", "landmark"]),
      name: z.string().min(1),
      col: z.number().int().min(0),
      row: z.number().int().min(0),
      description: z.string().default(""),
    }),
  ),
  /** Optional road paths in offset coordinates, in order. */
  roads: z.array(z.array(z.object({ col: z.number().int(), row: z.number().int() }))).default([]),
});
export type HandcraftedWorldPack = z.infer<typeof HandcraftedWorldPackSchema>;

export const RelationshipSchema = z.object({
  trust: z.number().int().min(-100).max(100).default(0),
  affection: z.number().int().min(-100).max(100).default(0),
  respect: z.number().int().min(-100).max(100).default(0),
  fear: z.number().int().min(-100).max(100).default(0),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const InventoryEntrySchema = z.object({
  itemId: ContentIdSchema,
  quantity: z.number().int().min(1).max(999),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const CharacterAppearanceSchema = z.object({
  palette: z.string().min(1).max(40),
  sigil: z.string().min(1).max(40),
  seed: z.string().min(1).max(80),
});
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>;

export const EquipmentSchema = z.object({
  mainHand: ContentIdSchema.optional(),
  offHand: ContentIdSchema.optional(),
  armor: ContentIdSchema.optional(),
  accessory1: ContentIdSchema.optional(),
  accessory2: ContentIdSchema.optional(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const CharacterBuildSchema = z.object({
  name: z.string().min(1).max(60),
  pronouns: z.string().min(1).max(30).default("they/them"),
  ancestryId: ContentIdSchema,
  classId: ContentIdSchema,
  backgroundId: ContentIdSchema,
  baseAttributes: AttributesSchema,
  skillIds: z.array(z.string().min(1)).min(2),
  appearance: CharacterAppearanceSchema,
});
export type CharacterBuild = z.infer<typeof CharacterBuildSchema>;

export const EntityKindSchema = z.enum(["player", "npc", "companion", "enemy", "object"]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const EntitySchema = z.object({
  id: z.string().min(1),
  kind: EntityKindSchema,
  name: z.string().min(1).max(80),
  pronouns: z.string().max(30).default("they/them"),
  description: z.string().max(2000).default(""),
  ancestryId: ContentIdSchema.optional(),
  classId: ContentIdSchema.optional(),
  backgroundId: ContentIdSchema.optional(),
  level: z.number().int().min(1).max(20).default(1),
  attributes: AttributesSchema,
  hp: z.object({ current: z.number().int().min(0), max: z.number().int().min(1) }),
  ac: z.number().int().min(1).max(40),
  speed: z.number().int().min(1).max(20).default(6),
  focus: z.object({ current: z.number().int().min(0), max: z.number().int().min(0) }),
  conditions: z.array(ConditionIdSchema).default([]),
  abilityIds: z.array(ContentIdSchema).default([]),
  inventory: z.array(InventoryEntrySchema).default([]),
  equipment: EquipmentSchema.default({}),
  skillIds: z.array(z.string().min(1)).default([]),
  appearance: CharacterAppearanceSchema.optional(),
  factionId: z.string().optional(),
  hex: HexSchema.optional(),
  localMapId: z.string().optional(),
  recruitable: z.boolean().default(false),
  companion: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
export type Entity = z.infer<typeof EntitySchema>;

export const PartyStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  memberIds: z.array(z.string()).default([]),
  gold: z.number().int().min(0).default(0),
  position: HexSchema,
});
export type PartyState = z.infer<typeof PartyStateSchema>;

export const LocalBuildingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["shop", "inn", "temple", "hall", "home", "gate", "workshop", "other"]),
  hex: HexSchema,
  description: z.string().default(""),
  shopId: z.string().optional(),
});
export type LocalBuilding = z.infer<typeof LocalBuildingSchema>;

export const LocalInteractableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["object", "altar", "shrine", "chest", "sign", "stairs"]),
  hex: HexSchema,
  description: z.string().default(""),
  itemId: ContentIdSchema.optional(),
  oneShot: z.boolean().default(true),
});
export type LocalInteractable = z.infer<typeof LocalInteractableSchema>;

export const LocalExitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hex: HexSchema,
  description: z.string().default(""),
  target: z.enum(["world", "travel"]).default("world"),
  direction: z.number().int().min(0).max(5).optional(),
});
export type LocalExit = z.infer<typeof LocalExitSchema>;

export const LocalEncounterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hex: HexSchema,
  radius: z.number().int().min(0).max(4).default(0),
  description: z.string().default(""),
});
export type LocalEncounter = z.infer<typeof LocalEncounterSchema>;

export const LocalMapSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: LocalMapKindSchema,
  description: z.string().default(""),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Row-major local tile IDs. */
  tiles: z.array(z.string()).default([]),
  entrance: HexSchema,
  buildings: z.array(LocalBuildingSchema).default([]),
  exits: z.array(LocalExitSchema).default([]),
  interactables: z.array(LocalInteractableSchema).default([]),
  encounters: z.array(LocalEncounterSchema).default([]),
  spots: z.record(z.string(), HexSchema).default({}),
});
export type LocalMap = z.infer<typeof LocalMapSchema>;

export const LocalStateSchema = z.object({
  map: LocalMapSchema,
  position: HexSchema,
  returnWorldPosition: HexSchema,
  poiId: z.string().min(1),
  visitedInteractables: z.array(z.string()).default([]),
  encounterFlags: z.record(z.string(), z.boolean()).default({}),
});
export type LocalState = z.infer<typeof LocalStateSchema>;

export const TravelGateSchema = z.object({
  poiId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["town", "village", "dungeon", "ruin", "shrine", "camp", "landmark"]),
  gateHex: HexSchema,
  outsideHex: HexSchema,
});
export type TravelGate = z.infer<typeof TravelGateSchema>;

export const TravelEnemyGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enemyIds: z.array(z.string().min(1)).min(1),
  hex: HexSchema,
  aggroRadius: z.number().int().min(1).max(12).default(5),
  patrolRadius: z.number().int().min(0).max(6).default(2),
  description: z.string().default(""),
});
export type TravelEnemyGroup = z.infer<typeof TravelEnemyGroupSchema>;

export const TravelStateSchema = z.object({
  map: LocalMapSchema,
  worldHex: HexSchema,
  /** Authoritative anchor hex. The renderer keeps sub-hex motion locally. */
  position: HexSchema,
  facing: z.number().int().min(0).max(5).default(0),
  entryEdge: z.number().int().min(0).max(5).optional(),
  gates: z.array(TravelGateSchema).default([]),
  /** Where the party should stand after leaving a town/dungeon. */
  gateOutside: HexSchema.optional(),
  enemies: z.array(TravelEnemyGroupSchema).default([]),
  clearedGroupIds: z.array(z.string()).default([]),
});
export type TravelState = z.infer<typeof TravelStateSchema>;

export const ShopStateSchema = z.object({
  id: z.string().min(1),
  stock: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type ShopState = z.infer<typeof ShopStateSchema>;

export const QuestStatusSchema = z.enum(["available", "active", "completed", "failed", "abandoned"]);

export const QuestObjectiveSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["reach", "interact", "kill", "collect", "escort", "survive", "choice", "timer"]),
  description: z.string().min(1),
  targetId: z.string().optional(),
  targetHex: HexSchema.optional(),
  required: z.number().int().min(0).default(1),
  progress: z.number().int().min(0).default(0),
  complete: z.boolean().default(false),
});
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

export const QuestStateSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  giverId: z.string().optional(),
  status: QuestStatusSchema.default("active"),
  stageId: z.string().min(1),
  objectives: z.array(QuestObjectiveSchema).default([]),
  rewards: z.record(z.string(), z.unknown()).default({}),
  flags: z.record(z.string(), z.unknown()).default({}),
});
export type QuestState = z.infer<typeof QuestStateSchema>;

export const FactionStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  reputation: z.number().int().min(-100).max(100).default(0),
});
export type FactionState = z.infer<typeof FactionStateSchema>;

export const RumorSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(600),
  sourceId: z.string().optional(),
  createdAt: z.string(),
  read: z.boolean().default(false),
});
export type Rumor = z.infer<typeof RumorSchema>;

export const BattleParticipantSchema = z.object({
  entityId: z.string(),
  initiative: z.number().int(),
  team: z.enum(["party", "enemy", "neutral"]),
});
export const BattleUnitSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().optional(),
  name: z.string().min(1),
  team: z.enum(["party", "enemy", "neutral"]),
  kind: z.enum(["player", "companion", "enemy"]).default("enemy"),
  hp: z.number().int().min(0),
  maxHp: z.number().int().min(1),
  ac: z.number().int().min(1).max(40),
  speed: z.number().int().min(1).max(20).default(6),
  initiative: z.number().int(),
  position: HexSchema,
  moved: z.number().int().min(0).default(0),
  actionUsed: z.boolean().default(false),
  bonusUsed: z.boolean().default(false),
  defeated: z.boolean().default(false),
  palette: z.string().optional(),
  conditions: z.array(z.string()).default([]),
});
export type BattleUnit = z.infer<typeof BattleUnitSchema>;

export const BattleStateSchema = z.object({
  id: z.string().min(1),
  arena: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    terrain: z.array(z.string()).default([]),
  }),
  map: LocalMapSchema.optional(),
  units: z.array(BattleUnitSchema).default([]),
  activeUnitId: z.string().optional(),
  status: z.enum(["active", "victory", "defeat", "retreated"]).default("active"),
  source: z.enum(["travel", "dungeon", "scripted"]).default("travel"),
  travelGroupId: z.string().optional(),
  rewards: z.object({ gold: z.number().int().min(0).default(0) }).default({ gold: 0 }),
  round: z.number().int().min(1).default(1),
  turnIndex: z.number().int().min(0).default(0),
  order: z.array(BattleParticipantSchema).default([]),
  objective: z.enum(["defeat", "survive", "escape", "protect", "hold"]).default("defeat"),
  objectiveTarget: z.number().int().min(0).optional(),
  log: z.array(z.string()).default([]),
});
export type BattleState = z.infer<typeof BattleStateSchema>;

export const ClockSchema = z.object({
  day: z.number().int().min(1).default(1),
  hour: z.number().int().min(0).max(23).default(8),
  minute: z.number().int().min(0).max(59).default(0),
});
export type Clock = z.infer<typeof ClockSchema>;

export const GameStateSchema = z.object({
  version: z.literal(SAVE_VERSION),
  campaign: CampaignMetaSchema,
  clock: ClockSchema,
  world: WorldStateSchema,
  party: PartyStateSchema,
  entities: z.record(z.string(), EntitySchema).default({}),
  quests: z.record(z.string(), QuestStateSchema).default({}),
  factions: z.record(z.string(), FactionStateSchema).default({}),
  rumors: z.array(RumorSchema).default([]),
  relationships: z.record(z.string(), RelationshipSchema).default({}),
  flags: z.record(z.string(), z.unknown()).default({}),
  local: LocalStateSchema.optional(),
  travel: TravelStateSchema.optional(),
  shops: z.record(z.string(), ShopStateSchema).default({}),
  battle: BattleStateSchema.optional(),
  rng: z.object({
    seed: z.string(),
    cursor: z.number().int().min(0).default(0),
    state: z.number().int().optional(),
  }),
});
export type GameState = z.infer<typeof GameStateSchema>;

export const CampaignSaveRequestSchema = z.object({
  state: GameStateSchema,
});
export type CampaignSaveRequest = z.infer<typeof CampaignSaveRequestSchema>;

export const CampaignResponseSchema = z.object({
  campaign: GameStateSchema.nullable(),
  updatedAt: z.string().nullable(),
});
export type CampaignResponse = z.infer<typeof CampaignResponseSchema>;

export const CampaignSlotInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  worldSource: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignSlotInfo = z.infer<typeof CampaignSlotInfoSchema>;

export const CampaignSlotsResponseSchema = z.object({
  slots: z.array(CampaignSlotInfoSchema),
});
export type CampaignSlotsResponse = z.infer<typeof CampaignSlotsResponseSchema>;

export const GameCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("party.move"), to: HexSchema, cost: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("time.wait"), hours: z.number().min(0).max(24) }),
  z.object({ type: z.literal("time.rest"), kind: z.enum(["short", "long"]) }),
  z.object({ type: z.literal("dialog.interact"), entityId: z.string().min(1) }),
  z.object({ type: z.literal("battle.start"), enemyIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("battle.end"), outcome: z.enum(["victory", "defeat", "retreat"]) }),
  z.object({
    type: z.literal("ai.apply_intent"),
    npcId: z.string().min(1),
    intent: z.record(z.string(), z.unknown()),
  }),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;

export const GameEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("party.moved"), from: HexSchema, to: HexSchema, cost: z.number().int() }),
  z.object({ type: z.literal("time.advanced"), minutes: z.number().int(), clock: ClockSchema }),
  z.object({
    type: z.literal("disposition.changed"),
    npcId: z.string(),
    axis: z.enum(["trust", "affection", "respect", "fear"]),
    delta: z.number().int(),
    reason: z.string(),
  }),
  z.object({ type: z.literal("quest.offered"), questId: z.string(), templateId: z.string() }),
  z.object({ type: z.literal("battle.started"), battleId: z.string(), enemyIds: z.array(z.string()) }),
  z.object({
    type: z.literal("ai.intent_rejected"),
    npcId: z.string(),
    intentType: z.string(),
    reason: z.string(),
  }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

export const AttributeKeys = AttributeKeySchema.options;
