import type { AiCallLog, AppSettings, GameState, ModelInfo } from "@iwakura/contracts";
import { AppSettingsSchema, GameStateSchema } from "@iwakura/contracts";
import type { Db } from "./db.js";

const SETTINGS_KEY = "app.settings";

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  get(): AppSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as
      | { value: string }
      | undefined;
    if (!row) return AppSettingsSchema.parse({});
    try {
      return AppSettingsSchema.parse(JSON.parse(row.value));
    } catch {
      return AppSettingsSchema.parse({});
    }
  }

  save(settings: AppSettings): AppSettings {
    const parsed = AppSettingsSchema.parse(settings);
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(SETTINGS_KEY, JSON.stringify(parsed), new Date().toISOString());
    return parsed;
  }
}

export class AiCallRepository {
  constructor(private readonly db: Db) {}

  log(call: AiCallLog): void {
    this.db
      .prepare(
        `INSERT INTO ai_calls
          (id, role, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        call.id,
        call.role,
        call.model,
        call.promptTokens,
        call.completionTokens,
        call.costUsd,
        call.latencyMs,
        call.status,
        call.error ?? null,
        call.createdAt,
      );
  }

  recent(limit = 25): AiCallLog[] {
    const rows = this.db
      .prepare(
        `SELECT id, role, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, status, error, created_at
         FROM ai_calls ORDER BY created_at DESC LIMIT ?`,
      )
      .all(Math.max(1, Math.min(200, limit))) as Array<{
      id: string;
      role: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      cost_usd: number;
      latency_ms: number;
      status: "ok" | "error" | "aborted";
      error: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      costUsd: row.cost_usd,
      latencyMs: row.latency_ms,
      status: row.status,
      ...(row.error ? { error: row.error } : {}),
      createdAt: row.created_at,
    }));
  }

  spendSince(isoDate: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_calls WHERE created_at >= ?")
      .get(isoDate) as { total: number } | undefined;
    return Number(row?.total ?? 0);
  }

  spendThisMonth(now = new Date()): number {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return this.spendSince(start.toISOString());
  }

  clear(): void {
    this.db.exec("DELETE FROM ai_calls");
  }
}

export class CampaignRepository {
  constructor(private readonly db: Db) {}

  get(): { state: GameState; updatedAt: string } | null {
    const row = this.db.prepare("SELECT state_json, updated_at FROM campaigns WHERE id = 'active'").get() as
      | { state_json: string; updated_at: string }
      | undefined;
    if (!row) return null;
    try {
      return { state: GameStateSchema.parse(JSON.parse(row.state_json)), updatedAt: row.updated_at };
    } catch {
      return null;
    }
  }

  save(state: GameState): string {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO campaigns (id, name, world_source, state_json, created_at, updated_at)
         VALUES ('active', ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           world_source = excluded.world_source,
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .run(state.campaign.name, state.world.source, JSON.stringify(state), now, now);
    return now;
  }

  clear(): void {
    this.db.prepare("DELETE FROM campaigns WHERE id = 'active'").run();
  }
}

export class ModelCacheRepository {
  constructor(private readonly db: Db) {}

  get(id: string, maxAgeMs: number): ModelInfo[] | null {
    const row = this.db.prepare("SELECT payload, fetched_at FROM model_cache WHERE id = ?").get(id) as
      | { payload: string; fetched_at: string }
      | undefined;
    if (!row) return null;
    const age = Date.now() - new Date(row.fetched_at).getTime();
    if (age > maxAgeMs) return null;
    try {
      return JSON.parse(row.payload) as ModelInfo[];
    } catch {
      return null;
    }
  }

  set(id: string, models: ModelInfo[]): void {
    this.db
      .prepare(
        `INSERT INTO model_cache (id, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(id, JSON.stringify(models), new Date().toISOString());
  }
}
