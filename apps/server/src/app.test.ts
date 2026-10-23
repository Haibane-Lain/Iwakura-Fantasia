import { createGameState, generateWorld } from "@iwakura/engine";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { closeDatabase, type Db, openDatabase } from "./db.js";
import type { Keystore } from "./keystore.js";

const TOKEN = "test-token-0123456789abcdef";
const auth = { Authorization: `Bearer ${TOKEN}` };

describe("local server", () => {
  let db: Db;
  let keystore: Keystore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(":memory:");
    let key: string | null = null;
    keystore = {
      get: () => key,
      set: (value) => {
        key = value;
      },
      clear: () => {
        key = null;
      },
      source: () => (key ? "environment" : "none"),
    };
    app = createApp({
      db,
      keystore,
      token: TOKEN,
      version: "test",
      logger: pino({ level: "silent" }),
      now: () => new Date("2026-10-23T12:00:00.000Z"),
    });
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("exposes health without auth", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; database: string };
    expect(body.ok).toBe(true);
    expect(body.database).toBe("ok");
  });

  it("rejects requests with a missing or wrong token", async () => {
    const missing = await app.request("/api/settings");
    expect(missing.status).toBe(401);
    const wrong = await app.request("/api/settings", { headers: { Authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
  });

  it("returns defaults and persists settings", async () => {
    const initial = await app.request("/api/settings", { headers: auth });
    expect(initial.status).toBe(200);
    const initialBody = (await initial.json()) as {
      settings: { ai: { temperature: number; npcModel: string } };
      apiKeyConfigured: boolean;
    };
    expect(initialBody.apiKeyConfigured).toBe(false);
    expect(initialBody.settings.ai.npcModel).toBe("deepseek-v4.1-flash");

    const update = await app.request("/api/settings", {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ai: { temperature: 0.4, npcModel: "glm-5.3-flash" } }),
    });
    expect(update.status).toBe(200);
    const updated = (await update.json()) as { settings: { ai: { temperature: number; npcModel: string } } };
    expect(updated.settings.ai.temperature).toBe(0.4);
    expect(updated.settings.ai.npcModel).toBe("glm-5.3-flash");

    const reread = await app.request("/api/settings", { headers: auth });
    const rereadBody = (await reread.json()) as { settings: { ai: { temperature: number } } };
    expect(rereadBody.settings.ai.temperature).toBe(0.4);
  });

  it("returns the curated catalog without a key", async () => {
    const response = await app.request("/api/models", { headers: auth });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      models: Array<{ id: string }>;
      source: string;
      configured: boolean;
    };
    expect(body.configured).toBe(false);
    expect(body.source).toBe("static");
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0]?.id).toBeTruthy();
  });

  it("refuses an AI test without a key", async () => {
    const response = await app.request("/api/ai/test", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("missing_key");
  });

  it("logs no calls when nothing was attempted", async () => {
    const response = await app.request("/api/ai/calls", { headers: auth });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { calls: unknown[] };
    expect(body.calls).toHaveLength(0);
  });

  it("saves, reads, and clears the active campaign", async () => {
    const empty = await app.request("/api/campaign", { headers: auth });
    const emptyBody = (await empty.json()) as { campaign: null; updatedAt: null };
    expect(emptyBody.campaign).toBeNull();

    const world = generateWorld({
      source: "handcrafted",
      seed: "core:redford_reach",
    }).world;
    const state = createGameState({
      world,
      settings: {
        worldSource: "handcrafted",
        seed: "core:redford_reach",
        genParams: {
          width: 64,
          height: 64,
          seaLevel: 0.42,
          climate: "varied",
          magicLevel: "standard",
          danger: "normal",
          settlementDensity: 0.5,
        },
        difficulty: "normal",
        contentRating: "teen",
        aiEnabled: true,
      },
      campaignId: "campaign-test",
      campaignName: "The Redford Chronicle",
      now: new Date("2026-10-23T08:00:00.000Z"),
    });

    const save = await app.request("/api/campaign", {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    expect(save.status).toBe(200);

    const loaded = await app.request("/api/campaign", { headers: auth });
    expect(loaded.status).toBe(200);
    const loadedBody = (await loaded.json()) as { campaign: typeof state; updatedAt: string };
    expect(loadedBody.campaign.campaign.name).toBe("The Redford Chronicle");
    expect(loadedBody.campaign.world.name).toBe("Redford Reach");
    expect(loadedBody.updatedAt).toBeTruthy();

    const clear = await app.request("/api/campaign", { method: "DELETE", headers: auth });
    expect(clear.status).toBe(200);
    const after = await app.request("/api/campaign", { headers: auth });
    expect(((await after.json()) as { campaign: null }).campaign).toBeNull();
  });
});
