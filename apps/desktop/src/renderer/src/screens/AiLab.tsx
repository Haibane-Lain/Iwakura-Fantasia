import type { AiCallLog, AiStreamEvent } from "@iwakura/contracts";
import {
  AlertTriangle,
  ChevronDown,
  CircleStop,
  FlaskConical,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMs, formatTokens, formatUsd } from "../api/client";
import { cn, Metric, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

type UsageEvent = Extract<AiStreamEvent, { type: "usage" }>;

const PRESETS = [
  {
    id: "innkeeper",
    label: "Innkeeper",
    system:
      "You are Mara Vell, the innkeeper of the Salt Lantern. You are warm to paying guests, dryly amused by trouble, and careful never to repeat what you hear upstairs. You know the miller's family has not been seen in three days. Keep speech under 90 words.",
    prompt: "The player sets a silver coin on the counter and asks, quietly, what happened at the mill.",
  },
  {
    id: "guard",
    label: "Wary guard",
    system:
      "You are Captain Orin of the north gate. You are tired, suspicious, and not cruel. You have orders to admit no one after curfew without a writ. You respect confidence and despise flattery. Keep speech under 80 words.",
    prompt: "The player arrives after curfew, hood up, and claims to be expected at the keep.",
  },
  {
    id: "merchant",
    label: "Merchant",
    system:
      "You are Yazmin, a travelling merchant with a good eye and a better memory for faces. You enjoy a bargain but hate being played for a fool. You will not buy stolen goods openly. Keep speech under 70 words.",
    prompt:
      "The player offers a dented silver chalice and says it belonged to their grandmother. You are almost certain it came from the shrine at Redford.",
  },
];

export function AiLab() {
  const api = useAppStore((state) => state.api);
  const settings = useAppStore((state) => state.settings);
  const models = useAppStore((state) => state.models);
  const modelsSource = useAppStore((state) => state.modelsSource);
  const refreshModels = useAppStore((state) => state.refreshModels);

  const [model, setModel] = useState(settings?.settings.ai.npcModel ?? "deepseek-v4.1-flash");
  const [temperature, setTemperature] = useState(settings?.settings.ai.temperature ?? 0.8);
  const [system, setSystem] = useState(PRESETS[0]!.system);
  const [prompt, setPrompt] = useState(PRESETS[0]!.prompt);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [usage, setUsage] = useState<UsageEvent | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; event: AiStreamEvent }>>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [calls, setCalls] = useState<AiCallLog[]>([]);
  const [callsError, setCallsError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = useMemo(() => models.find((candidate) => candidate.id === model), [models, model]);

  useEffect(() => {
    if (settings) {
      setModel((current) => current || settings.settings.ai.npcModel);
      setTemperature((current) => (current === 0.8 ? settings.settings.ai.temperature : current));
    }
  }, [settings]);

  const loadCalls = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.getCalls(20);
      setCalls(result.calls);
      setCallsError(null);
    } catch (caught) {
      setCallsError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [api]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setSystem(preset.system);
    setPrompt(preset.prompt);
    setError(null);
  };

  const run = async () => {
    if (!api || running || !prompt.trim()) return;
    setRunning(true);
    setOutput("");
    setError(null);
    setUsage(null);
    setEvents([]);
    setStatus("Opening the channel…");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.streamAiTest(
        {
          prompt: prompt.trim(),
          system: system.trim() || undefined,
          model,
          temperature,
          maxOutputTokens: 1000,
        },
        (event) => {
          setEvents((current) => [...current.slice(-80), { id: crypto.randomUUID(), event }]);
          switch (event.type) {
            case "status":
              setStatus(event.message);
              break;
            case "delta":
              setOutput((current) => current + event.text);
              break;
            case "usage":
              setUsage(event);
              break;
            case "done":
              setOutput(event.text);
              setStatus("");
              break;
            case "error":
              setError(event.message);
              setStatus("");
              break;
          }
        },
        controller.signal,
      );
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setRunning(false);
      setStatus("");
      abortRef.current = null;
      void loadCalls();
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <SectionLabel>Narration workbench</SectionLabel>
              <span className="chip">
                <StatusDot
                  tone={modelsSource === "live" ? "ok" : modelsSource === "cache" ? "warn" : "muted"}
                />
                {modelsSource} catalog
              </span>
            </div>
            <h1 className="mt-2 font-display text-4xl tracking-wide text-parchment">AI Lab</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              A direct view into the narrator layer. Every call is streamed, validated, logged, and priced.
              This is the same gateway the NPC pipeline will use.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={() => void refreshModels(true)}>
              <RefreshCw className="size-3.5" />
              Refresh catalog
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowEvents((value) => !value)}>
              <Terminal className="size-3.5" />
              {showEvents ? "Hide events" : "Event stream"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1.45fr_0.8fr]">
          <div className="space-y-5">
            <Panel lit className="p-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div>
                  <label className="label" htmlFor="ai-model">
                    Model
                  </label>
                  <select
                    id="ai-model"
                    className="input"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  >
                    {models.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.id}
                      </option>
                    ))}
                    {!models.some((candidate) => candidate.id === model) ? (
                      <option value={model}>{model}</option>
                    ) : null}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ai-temperature">
                    Temperature <span className="text-gold/80">{temperature.toFixed(2)}</span>
                  </label>
                  <input
                    id="ai-temperature"
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={temperature}
                    onChange={(event) => setTemperature(Number(event.target.value))}
                    className="mt-2 w-full accent-[#c9a35a]"
                  />
                </div>
              </div>

              <details className="group mt-4 border border-line-soft bg-black/15">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-muted">
                  <span className="flex items-center gap-2">
                    <Wand2 className="size-3 text-gold/70" />
                    System prompt
                  </span>
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line-soft p-3">
                  <textarea
                    className="input min-h-28 resize-y font-mono text-[11px] leading-5"
                    value={system}
                    onChange={(event) => setSystem(event.target.value)}
                    spellCheck={false}
                  />
                </div>
              </details>

              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="kicker mr-1">Presets</span>
                  {PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className="chip transition-colors hover:border-gold/50 hover:text-parchment"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className="label" htmlFor="ai-prompt">
                  Player input
                </label>
                <textarea
                  id="ai-prompt"
                  className="input min-h-28 resize-y font-display text-[15px] leading-6"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="What does the player say or do?"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] text-faint">
                  <Sparkles className="size-3 text-gold/60" />
                  {selectedModel
                    ? `${selectedModel.provider} · ${(selectedModel.contextWindow ?? 0).toLocaleString()} ctx`
                    : "custom model id"}
                </div>
                <div className="flex items-center gap-2">
                  {running ? (
                    <button type="button" className="btn" onClick={cancel}>
                      <CircleStop className="size-3.5" />
                      Stop
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void run()}
                    disabled={running || !prompt.trim()}
                  >
                    <Send className="size-3.5" />
                    Send turn
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mt-4 flex items-start gap-2 border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-[#e0b0aa]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </Panel>

            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
                <SectionLabel>Transcript</SectionLabel>
                <div className="flex items-center gap-3">
                  {status ? (
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-gold/80">
                      <span className="size-1.5 animate-pulse-soft rounded-full bg-gold" />
                      {status}
                    </span>
                  ) : null}
                  <span className="font-mono text-[10px] text-faint">{model}</span>
                </div>
              </div>
              <div className="min-h-[240px] bg-[linear-gradient(180deg,rgba(0,0,0,0.18),transparent)] px-6 py-5">
                {output ? (
                  <p
                    className={cn(
                      "whitespace-pre-wrap font-display text-[16px] leading-7 text-parchment",
                      running && "caret",
                    )}
                  >
                    {output}
                  </p>
                ) : running ? (
                  <p className="font-display text-[16px] italic leading-7 text-muted">
                    <span className="caret">The narrator is considering the scene</span>
                  </p>
                ) : (
                  <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                    <FlaskConical className="size-8 text-gold/30" strokeWidth={1} />
                    <p className="max-w-sm text-xs leading-5 text-faint">
                      Choose a preset or write your own line, then send a turn. The response streams from
                      OpenCode Go through the local gateway.
                    </p>
                  </div>
                )}
              </div>
            </Panel>

            {showEvents ? (
              <Panel className="p-4">
                <div className="flex items-center justify-between">
                  <SectionLabel>Raw event stream</SectionLabel>
                  <span className="font-mono text-[10px] text-faint">{events.length} frames</span>
                </div>
                <div className="mt-3 max-h-64 overflow-y-auto border border-line-soft bg-black/30 p-3 font-mono text-[10px] leading-5 text-parchment-dim">
                  {events.length === 0 ? (
                    <span className="text-faint">No frames yet.</span>
                  ) : (
                    events.map(({ id, event }) => (
                      <div key={id} className="border-b border-line-soft/40 py-1 last:border-0">
                        <span className="text-gold/70">{event.type}</span>{" "}
                        <span className="text-faint">{JSON.stringify(event).slice(0, 220)}</span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            ) : null}
          </div>

          <aside className="space-y-5">
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Telemetry</SectionLabel>
                <span className="chip">
                  <StatusDot tone={usage ? "ok" : "muted"} />
                  {usage ? "measured" : "idle"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Metric label="Input" value={usage ? formatTokens(usage.inputTokens) : "—"} hint="tokens" />
                <Metric label="Output" value={usage ? formatTokens(usage.outputTokens) : "—"} hint="tokens" />
                <Metric label="Cost" value={usage ? formatUsd(usage.costUsd) : "—"} hint="this turn" />
                <Metric label="Latency" value={usage ? formatMs(usage.latencyMs) : "—"} hint="wall clock" />
              </div>
              <div className="rule my-4" />
              <div className="space-y-1.5 font-mono text-[10px] leading-5 text-faint">
                <div className="flex justify-between gap-3">
                  <span>endpoint</span>
                  <span className="truncate text-parchment-dim">opencode.ai/inference/go</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>session</span>
                  <span className="text-parchment-dim">iwakura:lab</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>schema</span>
                  <span className="text-parchment-dim">SSE · text</span>
                </div>
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Recent calls</SectionLabel>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost px-2! py-1!"
                    onClick={() => void loadCalls()}
                    title="Refresh"
                  >
                    <RefreshCw className="size-3" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2! py-1!"
                    title="Clear call log"
                    onClick={async () => {
                      if (!api) return;
                      await api.clearCalls();
                      await loadCalls();
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>

              {callsError ? <p className="mt-3 text-[11px] text-[#d9a39d]">{callsError}</p> : null}

              <div className="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
                {calls.length === 0 ? (
                  <p className="py-6 text-center text-[11px] text-faint">No calls recorded yet.</p>
                ) : (
                  calls.map((call) => (
                    <div key={call.id} className="border border-line-soft bg-black/15 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-parchment-dim">
                          <StatusDot
                            tone={call.status === "ok" ? "ok" : call.status === "aborted" ? "warn" : "bad"}
                          />
                          <span className="truncate font-mono">{call.model}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-gold/80">
                          {formatUsd(call.costUsd)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-faint">
                        <span>
                          {formatTokens(call.promptTokens)} in · {formatTokens(call.completionTokens)} out
                        </span>
                        <span>{formatMs(call.latencyMs)}</span>
                      </div>
                      {call.error ? (
                        <div className="mt-1 truncate text-[10px] text-[#c98d86]">{call.error}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="p-5">
              <SectionLabel>What this proves</SectionLabel>
              <ul className="mt-3 space-y-2 text-[11px] leading-5 text-muted">
                <li className="flex gap-2">
                  <Play className="mt-1 size-3 shrink-0 text-gold/60" />
                  SSE streaming through the Electron local server.
                </li>
                <li className="flex gap-2">
                  <Play className="mt-1 size-3 shrink-0 text-gold/60" />
                  Stable <span className="font-mono text-parchment-dim">x-opencode-session</span> routing.
                </li>
                <li className="flex gap-2">
                  <Play className="mt-1 size-3 shrink-0 text-gold/60" />
                  Per-call token, cost, and latency accounting.
                </li>
                <li className="flex gap-2">
                  <Play className="mt-1 size-3 shrink-0 text-gold/60" />
                  SQLite persistence and a live debug surface.
                </li>
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}
