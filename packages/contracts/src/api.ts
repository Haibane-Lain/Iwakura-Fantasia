import { z } from "zod";
import { ContentRatingSchema, DifficultySchema } from "./game.js";

export const ModelInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  pricing: z
    .object({
      inputPerMillion: z.number().min(0),
      outputPerMillion: z.number().min(0),
      cachedInputPerMillion: z.number().min(0).optional(),
    })
    .optional(),
  supportsTools: z.boolean().default(false),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const AiSettingsSchema = z.object({
  aiEnabled: z.boolean().default(true),
  npcModel: z.string().min(1).default("deepseek-v4.1-flash"),
  directorModel: z.string().min(1).default("deepseek-v4-pro"),
  summaryModel: z.string().min(1).default("glm-5.3-flash"),
  temperature: z.number().min(0).max(2).default(0.8),
  monthlyBudgetUsd: z.number().min(0).max(10_000).default(20),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const AppSettingsSchema = z.object({
  ai: AiSettingsSchema.prefault({}),
  contentRating: ContentRatingSchema.default("teen"),
  difficulty: DifficultySchema.default("normal"),
  reduceMotion: z.boolean().default(false),
  uiScale: z.number().min(0.8).max(1.5).default(1),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const SettingsPatchSchema = z.object({
  ai: AiSettingsSchema.partial().optional(),
  contentRating: ContentRatingSchema.optional(),
  difficulty: DifficultySchema.optional(),
  reduceMotion: z.boolean().optional(),
  uiScale: z.number().min(0.8).max(1.5).optional(),
  apiKey: z.string().min(8).max(500).optional(),
  clearApiKey: z.boolean().optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const SettingsResponseSchema = z.object({
  settings: AppSettingsSchema,
  apiKeyConfigured: z.boolean(),
  apiKeySource: z.enum(["keystore", "environment", "none"]),
  spendThisMonthUsd: z.number().min(0),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

export const AiTestRequestSchema = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(8000).optional(),
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(1).max(4000).optional(),
});
export type AiTestRequest = z.infer<typeof AiTestRequestSchema>;

export const AiCallLogSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  model: z.string().min(1),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
  latencyMs: z.number().int().min(0),
  status: z.enum(["ok", "error", "aborted"]),
  error: z.string().optional(),
  createdAt: z.string(),
});
export type AiCallLog = z.infer<typeof AiCallLogSchema>;

export const AiStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), message: z.string() }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("usage"),
    model: z.string(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    costUsd: z.number().min(0),
    latencyMs: z.number().int().min(0),
  }),
  z.object({ type: z.literal("done"), text: z.string(), finishReason: z.string().optional() }),
  z.object({ type: z.literal("error"), message: z.string(), code: z.string().optional() }),
]);
export type AiStreamEvent = z.infer<typeof AiStreamEventSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  database: z.enum(["ok", "error"]),
  aiConfigured: z.boolean(),
  uptimeSeconds: z.number().min(0),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const BootstrapSchema = z.object({
  apiBase: z.string().url(),
  token: z.string().min(16),
  appVersion: z.string(),
  platform: z.string(),
});
export type Bootstrap = z.infer<typeof BootstrapSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
