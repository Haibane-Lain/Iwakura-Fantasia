import type {
  AiCallLog,
  AiStreamEvent,
  AiTestRequest,
  AppSettings,
  CampaignResponse,
  GameState,
  HealthResponse,
  ModelInfo,
  SettingsPatch,
  SettingsResponse,
} from "@iwakura/contracts";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface ModelsResponse {
  models: ModelInfo[];
  source: "live" | "cache" | "static";
  configured: boolean;
}

export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      ...extra,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(body ? { "Content-Type": "application/json" } : undefined),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ApiRequestError(
        payload.error ?? `Request failed (${response.status})`,
        response.status,
        payload.code,
      );
    }
    return (await response.json()) as T;
  }

  health(): Promise<HealthResponse> {
    return this.request("GET", "/api/health");
  }

  getSettings(): Promise<SettingsResponse> {
    return this.request("GET", "/api/settings");
  }

  updateSettings(patch: SettingsPatch): Promise<SettingsResponse> {
    return this.request("PUT", "/api/settings", patch);
  }

  getModels(refresh = false): Promise<ModelsResponse> {
    return this.request("GET", `/api/models${refresh ? "?refresh=1" : ""}`);
  }

  getCalls(limit = 20): Promise<{ calls: AiCallLog[] }> {
    return this.request("GET", `/api/ai/calls?limit=${limit}`);
  }

  clearCalls(): Promise<{ ok: boolean }> {
    return this.request("DELETE", "/api/ai/calls");
  }

  getCampaign(): Promise<CampaignResponse> {
    return this.request("GET", "/api/campaign");
  }

  saveCampaign(state: GameState): Promise<{ ok: boolean; updatedAt: string; id: string }> {
    return this.request("PUT", "/api/campaign", { state });
  }

  clearCampaign(): Promise<{ ok: boolean }> {
    return this.request("DELETE", "/api/campaign");
  }

  async streamAiTest(
    body: AiTestRequest,
    onEvent: (event: AiStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/ai/test`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ApiRequestError(
        payload.error ?? `Request failed (${response.status})`,
        response.status,
        payload.code,
      );
    }
    if (!response.body) throw new ApiRequestError("Streaming is unavailable", 500, "no_stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const emit = (block: string) => {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""))
        .join("\n");
      if (!data) return;
      try {
        onEvent(JSON.parse(data) as AiStreamEvent);
      } catch {
        // Ignore malformed frames; the server logs the real error.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary).replace(/\r/g, "");
        buffer = buffer.slice(boundary + 2);
        emit(block);
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) emit(buffer.replace(/\r/g, ""));
  }
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatMs(value: number): string {
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

export type { AppSettings };
