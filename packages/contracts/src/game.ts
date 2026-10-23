import { z } from "zod";
import { AttributeKeySchema, AttributesSchema, ConditionIdSchema, ContentIdSchema } from "./content.js";

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

export const EntityKindSchema = z.enum(["player", "npc", "companion", "enemy", "object"]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const EntitySchema = z.object({
  id: z.string().min(1),
  kind: EntityKindSchema,
  name: z.string().min(1).max(80),
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
  factionId: z.string().optional(),
  hex: HexSchema.optional(),
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

export const BattleParticipantSchema = z.object({
  entityId: z.string(),
  initiative: z.number().int(),
  team: z.enum(["party", "enemy", "neutral"]),
});
export const BattleStateSchema = z.object({
  id: z.string().min(1),
  arena: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    terrain: z.array(z.string()).default([]),
  }),
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
  relationships: z.record(z.string(), RelationshipSchema).default({}),
  flags: z.record(z.string(), z.unknown()).default({}),
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
