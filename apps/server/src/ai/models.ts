import type { ModelInfo } from "@iwakura/contracts";
import type { ModelCacheRepository } from "../db-repositories.js";
import { getKnownModel, STATIC_MODELS, toModelInfo } from "./pricing.js";

export const OPENCODE_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
export const OPENCODE_MODELS_URL = "https://opencode.ai/inference/go/v1/models";
export const OPENCODE_PROVIDER_ID = "opencode-go";
export const GO_USER_AGENT = "iwakura-fantasia/0.1";

const CACHE_ID = "opencode-go";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function goHeaders(apiKey: string, sessionId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "x-opencode-session": sessionId,
    "User-Agent": GO_USER_AGENT,
  };
}

interface ModelsPayload {
  data?: Array<{ id?: string; name?: string }>;
  models?: Array<{ id?: string; name?: string }>;
}

export async function fetchGoModels(apiKey: string, sessionId = "iwakura:catalog"): Promise<ModelInfo[]> {
  const response = await fetch(OPENCODE_MODELS_URL, {
    headers: goHeaders(apiKey, sessionId),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Model catalog request failed (${response.status} ${response.statusText})`);
  }
  const payload = (await response.json()) as ModelsPayload;
  const entries = payload.data ?? payload.models ?? [];
  const remoteIds = entries
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (remoteIds.length === 0) return STATIC_MODELS;

  const known = new Map(STATIC_MODELS.map((model) => [model.id, model]));
  const models: ModelInfo[] = [];
  for (const id of remoteIds) {
    const existing = known.get(id);
    if (existing) {
      models.push(existing);
      continue;
    }
    // Unknown but OpenAI-compatible model. Keep it selectable with zero price
    // until it is added to the pricing table.
    const knownModel = getKnownModel(id);
    if (knownModel) {
      models.push(toModelInfo(knownModel));
      continue;
    }
    models.push({
      id,
      name: id,
      provider: OPENCODE_PROVIDER_ID,
      supportsTools: true,
    });
  }

  // Include curated models even if the live endpoint omits them temporarily.
  for (const model of STATIC_MODELS) {
    if (!models.some((candidate) => candidate.id === model.id)) models.push(model);
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listModels(options: {
  apiKey: string | null;
  cache: ModelCacheRepository;
  refresh?: boolean;
}): Promise<{ models: ModelInfo[]; source: "live" | "cache" | "static" }> {
  if (!options.apiKey) return { models: STATIC_MODELS, source: "static" };
  if (!options.refresh) {
    const cached = options.cache.get(CACHE_ID, CACHE_TTL_MS);
    if (cached) return { models: cached, source: "cache" };
  }
  try {
    const models = await fetchGoModels(options.apiKey);
    options.cache.set(CACHE_ID, models);
    return { models, source: "live" };
  } catch {
    const cached = options.cache.get(CACHE_ID, Number.POSITIVE_INFINITY);
    if (cached) return { models: cached, source: "cache" };
    return { models: STATIC_MODELS, source: "static" };
  }
}
