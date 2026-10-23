import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { GO_USER_AGENT, OPENCODE_BASE_URL, OPENCODE_PROVIDER_ID } from "./models.js";

export interface StreamTurnOptions {
  apiKey: string;
  modelId: string;
  sessionId: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type TurnStreamEvent =
  | { type: "text"; text: string }
  | { type: "finish"; finishReason: string; usage: TurnUsage }
  | { type: "error"; error: unknown }
  | { type: "abort"; reason?: string };

export interface StreamTurnResult {
  events: AsyncIterable<TurnStreamEvent>;
}

/**
 * A per-call provider instance is cheap and lets us send a stable
 * x-opencode-session header for the campaign/NPC conversation.
 *
 * We consume `fullStream` rather than the text/usage getters because the
 * getters reject on provider errors and can surface as unhandled rejections
 * if the stream fails before any text arrives.
 */
export function streamTurn(options: StreamTurnOptions): StreamTurnResult {
  const provider = createOpenAICompatible({
    name: OPENCODE_PROVIDER_ID,
    baseURL: OPENCODE_BASE_URL,
    apiKey: options.apiKey,
    headers: {
      "x-opencode-session": options.sessionId,
      "User-Agent": GO_USER_AGENT,
    },
  });

  const result = streamText({
    model: provider(options.modelId),
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    abortSignal: options.signal,
    maxRetries: 1,
    onError: ({ error }) => options.onError?.(error),
  });

  const events = (async function* (): AsyncGenerator<TurnStreamEvent> {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          yield { type: "text", text: part.text };
          break;
        case "finish": {
          const usage = part.totalUsage ?? {};
          yield {
            type: "finish",
            finishReason: String(part.finishReason),
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            },
          };
          break;
        }
        case "error":
          yield { type: "error", error: part.error };
          break;
        case "abort":
          yield { type: "abort", reason: part.reason };
          break;
        default:
          break;
      }
    }
  })();

  return { events };
}
