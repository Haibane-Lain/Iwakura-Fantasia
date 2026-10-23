import { randomUUID, timingSafeEqual } from "node:crypto";
import { buildTestPrompt } from "@iwakura/ai-kit";
import {
  type AiCallLog,
  type AiStreamEvent,
  AiTestRequestSchema,
  SettingsPatchSchema,
} from "@iwakura/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { Logger } from "pino";
import { listModels } from "./ai/models.js";
import { computeCostUsd } from "./ai/pricing.js";
import { streamTurn } from "./ai/provider.js";
import type { Db } from "./db.js";
import { AiCallRepository, ModelCacheRepository, SettingsRepository } from "./db-repositories.js";
import type { Keystore } from "./keystore.js";

export interface AppOptions {
  db: Db;
  keystore: Keystore;
  token: string;
  version: string;
  logger: Logger;
  now?: () => Date;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const details = error as Error & {
      statusCode?: number;
      responseBody?: unknown;
      url?: string;
    };
    const parts = [error.message];
    if (details.statusCode) parts.push(`status ${details.statusCode}`);
    if (details.responseBody) {
      const body =
        typeof details.responseBody === "string"
          ? details.responseBody
          : JSON.stringify(details.responseBody);
      if (body && body !== "{}") parts.push(body.slice(0, 500));
    }
    return parts.join(" — ");
  }
  return String(error);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createApp(options: AppOptions): Hono {
  const { db, keystore, token, logger } = options;
  const now = options.now ?? (() => new Date());
  const settingsRepo = new SettingsRepository(db);
  const callsRepo = new AiCallRepository(db);
  const cacheRepo = new ModelCacheRepository(db);
  const startedAt = Date.now();

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/health") {
      await next();
      return;
    }
    const header = c.req.header("authorization") ?? "";
    if (!safeEqual(header, `Bearer ${token}`)) {
      return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
    }
    await next();
  });

  app.get("/api/health", (c) => {
    let database: "ok" | "error" = "ok";
    try {
      db.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }
    return c.json({
      ok: database === "ok",
      version: options.version,
      database,
      aiConfigured: Boolean(keystore.get()),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  const settingsPayload = () => ({
    settings: settingsRepo.get(),
    apiKeyConfigured: Boolean(keystore.get()),
    apiKeySource: keystore.source(),
    spendThisMonthUsd: callsRepo.spendThisMonth(now()),
  });

  app.get("/api/settings", (c) => c.json(settingsPayload()));

  app.put("/api/settings", async (c) => {
    const parsed = SettingsPatchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Invalid settings", code: "invalid_settings" }, 400);
    }
    const patch = parsed.data;
    const current = settingsRepo.get();

    if (patch.clearApiKey) keystore.clear();
    if (patch.apiKey) keystore.set(patch.apiKey.trim());

    const next = {
      ...current,
      ...(patch.ai ? { ai: { ...current.ai, ...patch.ai } } : {}),
      ...(patch.contentRating ? { contentRating: patch.contentRating } : {}),
      ...(patch.difficulty ? { difficulty: patch.difficulty } : {}),
      ...(patch.reduceMotion !== undefined ? { reduceMotion: patch.reduceMotion } : {}),
      ...(patch.uiScale !== undefined ? { uiScale: patch.uiScale } : {}),
    };

    settingsRepo.save(next);
    logger.info({ ai: next.ai }, "settings updated");
    return c.json(settingsPayload());
  });

  app.get("/api/models", async (c) => {
    const refresh = c.req.query("refresh") === "1";
    const result = await listModels({ apiKey: keystore.get(), cache: cacheRepo, refresh });
    return c.json({
      models: result.models,
      source: result.source,
      configured: Boolean(keystore.get()),
    });
  });

  app.get("/api/ai/calls", (c) => {
    const limit = Number(c.req.query("limit") ?? 25);
    return c.json({ calls: callsRepo.recent(Number.isFinite(limit) ? limit : 25) });
  });

  app.delete("/api/ai/calls", (c) => {
    callsRepo.clear();
    return c.json({ ok: true });
  });

  app.post("/api/ai/test", async (c) => {
    const parsed = AiTestRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", code: "invalid_request" }, 400);
    }
    const body = parsed.data;
    const apiKey = keystore.get();
    if (!apiKey) {
      return c.json({ error: "OpenCode Go API key is not configured", code: "missing_key" }, 400);
    }

    const settings = settingsRepo.get();
    if (!settings.ai.aiEnabled) {
      return c.json({ error: "AI is disabled in settings", code: "ai_disabled" }, 409);
    }

    const spent = callsRepo.spendThisMonth(now());
    if (settings.ai.monthlyBudgetUsd > 0 && spent >= settings.ai.monthlyBudgetUsd) {
      return c.json({ error: "Monthly AI budget reached", code: "budget_exceeded" }, 402);
    }

    const modelId = body.model ?? settings.ai.npcModel;
    const prompt = buildTestPrompt(body.system, body.prompt);
    const temperature = body.temperature ?? settings.ai.temperature;
    const sessionId = "iwakura:lab";
    const controller = new AbortController();
    const started = Date.now();

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => controller.abort());

      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason = "unknown";
      let status: AiCallLog["status"] = "ok";
      let errorMessage: string | undefined;
      let providerError: unknown;

      const send = async (event: AiStreamEvent) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      };

      try {
        await send({ type: "status", message: `Contacting ${modelId}…` });
        const result = streamTurn({
          apiKey,
          modelId,
          sessionId,
          prompt: prompt.user,
          system: prompt.system,
          temperature,
          maxOutputTokens: body.maxOutputTokens ?? 1200,
          signal: controller.signal,
          onError: (error) => {
            providerError = error;
          },
        });

        let finished = false;
        for await (const event of result.events) {
          switch (event.type) {
            case "text":
              fullText += event.text;
              await send({ type: "delta", text: event.text });
              break;
            case "finish":
              inputTokens = event.usage.inputTokens;
              outputTokens = event.usage.outputTokens;
              finishReason = event.finishReason;
              finished = true;
              break;
            case "error":
              providerError = event.error;
              throw event.error;
            case "abort":
              throw new Error(event.reason ?? "Model stream aborted");
          }
        }

        if (!finished) {
          throw new Error("Model stream ended without a finish event");
        }

        const costUsd = computeCostUsd(modelId, inputTokens, outputTokens);
        const latencyMs = Date.now() - started;

        await send({
          type: "usage",
          model: modelId,
          inputTokens,
          outputTokens,
          costUsd,
          latencyMs,
        });
        await send({ type: "done", text: fullText, finishReason });
        logger.info(
          { modelId, inputTokens, outputTokens, costUsd, latencyMs, finishReason },
          "ai test turn completed",
        );
      } catch (error) {
        status = controller.signal.aborted ? "aborted" : "error";
        errorMessage = describeError(providerError ?? error);
        logger.warn({ error: errorMessage, modelId }, "ai test turn failed");
        if (status !== "aborted") {
          await send({ type: "error", message: errorMessage, code: "provider_error" });
        }
      } finally {
        callsRepo.log({
          id: randomUUID(),
          role: "test",
          model: modelId,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          costUsd: computeCostUsd(modelId, inputTokens, outputTokens),
          latencyMs: Date.now() - started,
          status,
          ...(errorMessage ? { error: errorMessage } : {}),
          createdAt: now().toISOString(),
        });
      }
    });
  });

  app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));

  app.onError((error, c) => {
    logger.error({ error }, "unhandled request error");
    return c.json({ error: "Internal server error", code: "internal_error" }, 500);
  });

  return app;
}
