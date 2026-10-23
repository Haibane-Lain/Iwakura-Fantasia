import { z } from "zod";
import { NpcPersonaSchema } from "./ai.js";
import { ContentIdSchema } from "./content.js";

export const LocalMapKindSchema = z.enum(["town", "village", "dungeon"]);
export type LocalMapKind = z.infer<typeof LocalMapKindSchema>;

export const LocalPointSchema = z.object({
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});
export type LocalPoint = z.infer<typeof LocalPointSchema>;

export const LocalBuildingDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["shop", "inn", "temple", "hall", "home", "gate", "workshop", "other"]),
  door: LocalPointSchema,
  description: z.string().default(""),
  shopId: z.string().optional(),
});
export type LocalBuildingDefinition = z.infer<typeof LocalBuildingDefinitionSchema>;

export const LocalInteractableDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["object", "altar", "shrine", "chest", "sign", "stairs"]),
  point: LocalPointSchema,
  description: z.string().default(""),
  itemId: ContentIdSchema.optional(),
  oneShot: z.boolean().default(true),
});
export type LocalInteractableDefinition = z.infer<typeof LocalInteractableDefinitionSchema>;

export const LocalExitDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  point: LocalPointSchema,
  description: z.string().default(""),
  target: z.enum(["world"]).default("world"),
});
export type LocalExitDefinition = z.infer<typeof LocalExitDefinitionSchema>;

export const LocalEncounterDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  point: LocalPointSchema,
  radius: z.number().int().min(0).max(4).default(0),
  description: z.string().default(""),
});
export type LocalEncounterDefinition = z.infer<typeof LocalEncounterDefinitionSchema>;

export const LocalMapDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: LocalMapKindSchema,
  /** One string per row. Each character maps to a local tile ID in LOCAL_TILES. */
  rows: z.array(z.string().min(1)).min(1),
  worldPoiId: z.string().optional(),
  entrance: LocalPointSchema,
  buildings: z.array(LocalBuildingDefinitionSchema).default([]),
  exits: z.array(LocalExitDefinitionSchema).default([]),
  interactables: z.array(LocalInteractableDefinitionSchema).default([]),
  encounters: z.array(LocalEncounterDefinitionSchema).default([]),
  /** Named positions used by NPC schedules. */
  spots: z.record(z.string(), LocalPointSchema).default({}),
  npcIds: z.array(ContentIdSchema).default([]),
  description: z.string().default(""),
});
export type LocalMapDefinition = z.infer<typeof LocalMapDefinitionSchema>;

export const NpcScheduleEntrySchema = z.object({
  /** Inclusive local hour, 0-23. */
  fromHour: z.number().int().min(0).max(23),
  /** Exclusive local hour, 0-23. Wrap-around is supported. */
  toHour: z.number().int().min(0).max(24),
  mapId: z.string().min(1),
  spot: z.string().min(1),
  activity: z.string().min(1),
});
export type NpcScheduleEntry = z.infer<typeof NpcScheduleEntrySchema>;

export const NpcDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: z.string().min(1).max(80),
  pronouns: z.string().min(1).max(30).default("they/them"),
  ancestryId: ContentIdSchema.optional(),
  role: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  palette: z.string().min(1).max(40),
  sigil: z.string().min(1).max(40),
  schedule: z.array(NpcScheduleEntrySchema).min(1),
  dialogueId: z.string().min(1),
  shopId: z.string().optional(),
  questIds: z.array(z.string()).default([]),
  persona: NpcPersonaSchema,
});
export type NpcDefinition = z.infer<typeof NpcDefinitionSchema>;

export const DialogueActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("accept_quest"), questId: z.string().min(1) }),
  z.object({ type: z.literal("claim_quest"), questId: z.string().min(1) }),
  z.object({ type: z.literal("open_shop"), shopId: z.string().min(1) }),
  z.object({
    type: z.literal("adjust_disposition"),
    axis: z.enum(["trust", "affection", "respect", "fear"]),
    delta: z.number().int().min(-20).max(20),
    reason: z.string().max(200).default(""),
  }),
  z.object({ type: z.literal("wait"), hours: z.number().int().min(1).max(12) }),
]);
export type DialogueAction = z.infer<typeof DialogueActionSchema>;

export const DialogueOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(400),
  next: z.string().optional(),
  action: DialogueActionSchema.optional(),
});
export type DialogueOption = z.infer<typeof DialogueOptionSchema>;

export const DialogueNodeSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(2000),
  options: z.array(DialogueOptionSchema).min(1),
});
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueRootsSchema = z.object({
  default: z.string().min(1),
  questAvailable: z.string().optional(),
  questActive: z.string().optional(),
  questReady: z.string().optional(),
  questComplete: z.string().optional(),
});
export type DialogueRoots = z.infer<typeof DialogueRootsSchema>;

export const DialogueDefinitionSchema = z.object({
  id: z.string().min(1),
  npcId: z.string().min(1),
  roots: DialogueRootsSchema,
  nodes: z.record(z.string(), DialogueNodeSchema),
});
export type DialogueDefinition = z.infer<typeof DialogueDefinitionSchema>;

export const ShopStockEntrySchema = z.object({
  itemId: ContentIdSchema,
  quantity: z.number().int().min(0).max(999).default(1),
});
export type ShopStockEntry = z.infer<typeof ShopStockEntrySchema>;

export const ShopDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  merchantNpcId: z.string().optional(),
  description: z.string().default(""),
  stock: z.array(ShopStockEntrySchema).min(1),
  buyMultiplier: z.number().min(1).max(3).default(1),
  sellMultiplier: z.number().min(0).max(1).default(0.5),
});
export type ShopDefinition = z.infer<typeof ShopDefinitionSchema>;

export const QuestRewardSchema = z.object({
  gold: z.number().int().min(0).default(0),
  itemIds: z
    .array(
      z.object({
        itemId: ContentIdSchema,
        quantity: z.number().int().min(1).max(99).default(1),
      }),
    )
    .default([]),
});
export type QuestReward = z.infer<typeof QuestRewardSchema>;

export const QuestTemplateObjectiveSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["reach", "interact", "kill", "collect", "escort", "survive", "choice", "timer"]),
  description: z.string().min(1),
  targetId: z.string().optional(),
  required: z.number().int().min(1).default(1),
});
export type QuestTemplateObjective = z.infer<typeof QuestTemplateObjectiveSchema>;

export const QuestTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(1200),
  giverNpcId: z.string().min(1),
  turnInNpcId: z.string().min(1),
  objectives: z.array(QuestTemplateObjectiveSchema).min(1),
  rewards: QuestRewardSchema.default({ gold: 0, itemIds: [] }),
});
export type QuestTemplate = z.infer<typeof QuestTemplateSchema>;
