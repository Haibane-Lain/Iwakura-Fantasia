import { z } from "zod";

export const EmotionSchema = z.enum(["neutral", "friendly", "wary", "angry", "afraid", "sad", "amused"]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const DispositionAxisSchema = z.enum(["trust", "affection", "respect", "fear"]);
export type DispositionAxis = z.infer<typeof DispositionAxisSchema>;

/**
 * The constrained vocabulary the model may use to change game state.
 * Every intent is validated by the engine before it is applied.
 */
export const NpcIntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("adjust_disposition"),
    axis: DispositionAxisSchema,
    delta: z.number().int().min(-10).max(10),
    reason: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("remember"),
    fact: z.string().min(1).max(300),
    importance: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal("offer_quest"),
    templateId: z.string().min(1).max(120),
    hook: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("complete_quest"),
    questId: z.string().min(1).max(120),
  }),
  z.object({ type: z.literal("open_trade") }),
  z.object({
    type: z.literal("give_item"),
    itemId: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.literal("demand_item"),
    itemId: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.literal("offer_recruitment"),
    wage: z.number().int().min(0).max(500),
    role: z.string().max(120).default("companion"),
  }),
  z.object({ type: z.literal("dismiss_companion") }),
  z.object({
    type: z.literal("start_combat"),
    reason: z.string().min(1).max(200),
  }),
  z.object({ type: z.literal("flee") }),
  z.object({ type: z.literal("surrender") }),
  z.object({ type: z.literal("call_for_help") }),
  z.object({
    type: z.literal("set_meeting"),
    inHours: z.number().int().min(1).max(72),
    locationId: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal("mark_location"),
    locationId: z.string().min(1).max(120),
  }),
]);
export type NpcIntent = z.infer<typeof NpcIntentSchema>;

export const NpcTurnSchema = z.object({
  speech: z.string().min(1).max(1200),
  emotion: EmotionSchema.default("neutral"),
  intents: z.array(NpcIntentSchema).max(3).default([]),
  memoryWrites: z
    .array(
      z.object({
        text: z.string().min(1).max(300),
        importance: z.number().min(0).max(1).default(0.4),
      }),
    )
    .max(2)
    .default([]),
});
export type NpcTurn = z.infer<typeof NpcTurnSchema>;

/**
 * Director operations are a separate, much smaller vocabulary.
 * They are only accepted at scene boundaries and are always validated
 * against authored quest templates and content IDs.
 */
export const DirectorOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_quest_from_template"),
    templateId: z.string().min(1).max(120),
    giverId: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    hook: z.string().min(1).max(600),
  }),
  z.object({
    type: z.literal("advance_quest_stage"),
    questId: z.string().min(1).max(120),
    stageId: z.string().min(1).max(120),
    reason: z.string().max(300).default(""),
  }),
  z.object({
    type: z.literal("add_objective"),
    questId: z.string().min(1).max(120),
    objectiveId: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
    targetId: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("branch_quest"),
    questId: z.string().min(1).max(120),
    branchId: z.string().min(1).max(120),
    reason: z.string().max(300).default(""),
  }),
  z.object({
    type: z.literal("spawn_encounter"),
    templateId: z.string().min(1).max(120),
    hex: z.object({ q: z.number().int(), r: z.number().int() }),
    reason: z.string().max(300).default(""),
  }),
  z.object({
    type: z.literal("change_faction_relation"),
    factionId: z.string().min(1).max(120),
    delta: z.number().int().min(-20).max(20),
    reason: z.string().max(300).default(""),
  }),
  z.object({
    type: z.literal("reveal_rumor"),
    text: z.string().min(1).max(400),
    locationId: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("advance_clock"),
    minutes: z.number().int().min(1).max(720),
  }),
  z.object({
    type: z.literal("schedule_world_event"),
    eventId: z.string().min(1).max(120),
    inDays: z.number().int().min(1).max(30),
  }),
]);
export type DirectorOperation = z.infer<typeof DirectorOperationSchema>;

export const DirectorTurnSchema = z.object({
  beat: z.string().min(1).max(1200),
  mood: z.enum(["calm", "tense", "ominous", "hopeful", "grim"]).default("calm"),
  operations: z.array(DirectorOperationSchema).max(4).default([]),
});
export type DirectorTurn = z.infer<typeof DirectorTurnSchema>;

export const NpcPersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pronouns: z.string().max(40).default("they/them"),
  role: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  voice: z.string().min(1).max(400),
  goals: z.array(z.string().max(200)).max(6).default([]),
  fears: z.array(z.string().max(200)).max(6).default([]),
  secrets: z.array(z.string().max(300)).max(6).default([]),
  knowledge: z.array(z.string().max(300)).max(20).default([]),
  sampleLines: z.array(z.string().max(300)).max(6).default([]),
  archetype: z
    .enum(["civilian", "merchant", "guard", "scholar", "noble", "outlaw", "clergy", "adventurer"])
    .default("civilian"),
  recruitable: z.boolean().default(false),
});
export type NpcPersona = z.infer<typeof NpcPersonaSchema>;
