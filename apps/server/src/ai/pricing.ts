import type { ModelInfo } from "@iwakura/contracts";

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
}

export interface KnownModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  pricing: ModelPricing;
  supportsTools: boolean;
}

/**
 * Only models served over the OpenAI-compatible chat endpoint are listed here.
 * Go also exposes Anthropic/OpenAI/Google-specific endpoints; those need a
 * separate adapter and are intentionally out of scope for v1.
 */
export const KNOWN_MODELS: KnownModel[] = [
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6, cachedInputPerMillion: 0.003 },
    supportsTools: true,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    pricing: { inputPerMillion: 0.66, outputPerMillion: 1.98, cachedInputPerMillion: 0.022 },
    supportsTools: true,
  },
  {
    id: "glm-5.3-flash",
    name: "GLM-5.3 Flash",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.5, cachedInputPerMillion: 0.03 },
    supportsTools: true,
  },
  {
    id: "glm-5.3",
    name: "GLM-5.3",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 1.4, outputPerMillion: 4.4, cachedInputPerMillion: 0.26 },
    supportsTools: true,
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 1.4, outputPerMillion: 4.4, cachedInputPerMillion: 0.26 },
    supportsTools: true,
  },
  {
    id: "mimo-v2.6-flash",
    name: "MiMo V2.6 Flash",
    contextWindow: 1_048_576,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28, cachedInputPerMillion: 0.0028 },
    supportsTools: true,
  },
  {
    id: "mimo-v2.6-pro",
    name: "MiMo V2.6 Pro",
    contextWindow: 1_048_576,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87, cachedInputPerMillion: 0.003625 },
    supportsTools: true,
  },
  {
    id: "mimo-v2.5",
    name: "MiMo V2.5",
    contextWindow: 1_048_576,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28, cachedInputPerMillion: 0.0028 },
    supportsTools: true,
  },
  {
    id: "minimax-m3.1-flash",
    name: "MiniMax M3.1 Flash",
    contextWindow: 1_000_000,
    maxOutput: 512_000,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6, cachedInputPerMillion: 0.015 },
    supportsTools: true,
  },
  {
    id: "longcat-2.0",
    name: "LongCat 2.0",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2, cachedInputPerMillion: 0.006 },
    supportsTools: true,
  },
  {
    id: "longcat-2.5-preview-free",
    name: "LongCat 2.5 Preview (Free)",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    supportsTools: true,
  },
  {
    id: "hy3",
    name: "Hy3",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.58, cachedInputPerMillion: 0.035 },
    supportsTools: true,
  },
  {
    id: "step-5-preview",
    name: "Step 5 Preview",
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    pricing: { inputPerMillion: 1, outputPerMillion: 2.7, cachedInputPerMillion: 0.1 },
    supportsTools: true,
  },
];

const BY_ID = new Map(KNOWN_MODELS.map((model) => [model.id, model]));

export function getKnownModel(id: string): KnownModel | undefined {
  return BY_ID.get(id);
}

export function toModelInfo(model: KnownModel): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    provider: "opencode-go",
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    pricing: model.pricing,
    supportsTools: model.supportsTools,
  };
}

export const STATIC_MODELS: ModelInfo[] = KNOWN_MODELS.map(toModelInfo);

export function computeCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getKnownModel(modelId);
  if (!model) return 0;
  return (
    (Math.max(0, inputTokens) / 1_000_000) * model.pricing.inputPerMillion +
    (Math.max(0, outputTokens) / 1_000_000) * model.pricing.outputPerMillion
  );
}
