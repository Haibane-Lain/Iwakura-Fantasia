import type { AppSettings, CampaignSlotInfo, ModelInfo } from "@iwakura/contracts";
import { GameStateSchema } from "@iwakura/contracts";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatUsd } from "../api/client";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

type Notice = { tone: "ok" | "error" | "info"; text: string } | null;

function ModelSelect({
  label,
  value,
  models,
  onChange,
}: {
  label: string;
  value: string;
  models: ModelInfo[];
  onChange: (value: string) => void;
}) {
  const hasValue = models.some((model) => model.id === value);
  const id = `model-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {!hasValue ? <option value={value}>{value}</option> : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} · {model.id}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingsScreen() {
  const api = useAppStore((state) => state.api);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const settings = useAppStore((state) => state.settings);
  const models = useAppStore((state) => state.models);
  const modelsSource = useAppStore((state) => state.modelsSource);
  const applySettings = useAppStore((state) => state.applySettings);
  const refreshHealth = useAppStore((state) => state.refreshHealth);
  const refreshModels = useAppStore((state) => state.refreshModels);
  const campaign = useAppStore((state) => state.campaign);
  const setCampaign = useAppStore((state) => state.setCampaign);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const setScreen = useAppStore((state) => state.setScreen);

  const [form, setForm] = useState<AppSettings | null>(settings?.settings ?? null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [slots, setSlots] = useState<CampaignSlotInfo[]>([]);

  useEffect(() => {
    if (settings) setForm(settings.settings);
  }, [settings]);

  useEffect(() => {
    if (!api) return;
    void api
      .getCampaignSlots()
      .then((result) => setSlots(result.slots))
      .catch(() => undefined);
  }, [api]);

  const updateAi = <K extends keyof AppSettings["ai"]>(key: K, value: AppSettings["ai"][K]) => {
    setForm((current) => (current ? { ...current, ai: { ...current.ai, [key]: value } } : current));
  };

  const updateAudio = <K extends keyof AppSettings["audio"]>(key: K, value: AppSettings["audio"][K]) => {
    setForm((current) => (current ? { ...current, audio: { ...current.audio, [key]: value } } : current));
  };

  const save = async () => {
    if (!api || !form) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await api.updateSettings({
        ai: form.ai,
        audio: form.audio,
        contentRating: form.contentRating,
        difficulty: form.difficulty,
        reduceMotion: form.reduceMotion,
        highContrast: form.highContrast,
        showTooltips: form.showTooltips,
        uiScale: form.uiScale,
        graphicsQuality: form.graphicsQuality,
        weather: form.weather,
      });
      applySettings(result);
      setForm(result.settings);
      setNotice({ tone: "ok", text: "Settings saved." });
      await refreshHealth();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async () => {
    if (!api) return;
    if (keyInput.trim().length < 8) {
      setNotice({ tone: "error", text: "That key looks too short." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const result = await api.updateSettings({ apiKey: keyInput.trim() });
      applySettings(result);
      setKeyInput("");
      setNotice({
        tone: "ok",
        text: "API key stored securely. Testing the catalog next time you open the AI Lab.",
      });
      await Promise.all([refreshHealth(), refreshModels(true)]);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!api) return;
    if (!window.confirm("Remove the stored OpenCode Go key? AI features will stop working.")) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await api.updateSettings({ clearApiKey: true });
      applySettings(result);
      setNotice({ tone: "info", text: "Stored key removed." });
      await refreshHealth();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const refreshSlots = async () => {
    if (!api) return;
    try {
      const result = await api.getCampaignSlots();
      setSlots(result.slots);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const storeSlot = async (slot: string) => {
    if (!api) return;
    try {
      await api.saveCampaignSlot(slot);
      await refreshSlots();
      setNotice({ tone: "ok", text: `Campaign saved to slot ${slot}.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const loadSlot = async (slot: string) => {
    if (!api) return;
    if (!window.confirm(`Load slot ${slot}? Unsaved progress in the active chronicle will be replaced.`))
      return;
    try {
      const result = await api.loadCampaignSlot(slot);
      if (!result.campaign) throw new Error("Slot is empty.");
      setCampaign(result.campaign);
      setNotice({ tone: "ok", text: `Loaded slot ${slot}.` });
      setScreen("world");
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const removeSlot = async (slot: string) => {
    if (!api) return;
    if (!window.confirm(`Delete slot ${slot}?`)) return;
    try {
      await api.deleteCampaignSlot(slot);
      await refreshSlots();
      setNotice({ tone: "info", text: `Slot ${slot} deleted.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const exportCampaign = () => {
    if (!campaign) return;
    const blob = new Blob([JSON.stringify(campaign, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `iwakura-${campaign.campaign.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: "ok", text: "Campaign exported." });
  };

  const importCampaign = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Campaign files are limited to 5 MB.");
      const parsed = GameStateSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("That file is not a valid Iwakura campaign.");
      await saveCampaign(parsed.data);
      setCampaign(parsed.data);
      setNotice({ tone: "ok", text: "Campaign imported." });
      setScreen("world");
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  if (!settings || !form) {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading settings…</div>;
  }

  const spend = settings.spendThisMonthUsd;
  const budget = form.ai.monthlyBudgetUsd;
  const budgetPct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
  const keyReady = settings.apiKeyConfigured;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionLabel>Local configuration</SectionLabel>
            <h1 className="mt-2 font-display text-4xl tracking-wide text-parchment">Settings</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              Provider credentials, model routing, content tone, and the local engine. Everything lives on
              this machine.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            <Save className="size-3.5" />
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>

        {notice ? (
          <div
            className={cn(
              "mt-5 flex items-start gap-2 border px-3 py-2 text-xs",
              notice.tone === "ok" && "border-moss/40 bg-moss/10 text-[#c6d1a4]",
              notice.tone === "error" && "border-blood/40 bg-blood/10 text-[#e0b0aa]",
              notice.tone === "info" && "border-line bg-white/[0.02] text-muted",
            )}
          >
            {notice.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        ) : null}

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
          <Panel lit className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-gold/80" />
                <SectionLabel>OpenCode Go</SectionLabel>
              </div>
              <span className="chip">
                <StatusDot tone={keyReady ? "ok" : "warn"} />
                {keyReady ? "configured" : "missing"}
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted">
              The key is encrypted with the operating system keystore through Electron{" "}
              <span className="font-mono text-parchment-dim">safeStorage</span> and is only read by the local
              server.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="api-key">
                  {keyReady ? "Replace API key" : "API key"}
                </label>
                <input
                  id="api-key"
                  type="password"
                  className="input font-mono text-xs"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder={keyReady ? "••••••••••••••••••••" : "sk-…"}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void saveKey()}
                  disabled={saving || !keyInput.trim()}
                >
                  <ShieldCheck className="size-3.5" />
                  Store key
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void clearKey()}
                  disabled={saving || !keyReady}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
                <span className="text-[10px] text-faint">source: {settings.apiKeySource}</span>
              </div>
            </div>

            <div className="rule my-4" />

            <div className="space-y-1.5 font-mono text-[10px] leading-5 text-faint">
              <div className="flex justify-between gap-3">
                <span>base url</span>
                <span className="truncate text-parchment-dim">opencode.ai/inference/go/openai/v1</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>session header</span>
                <span className="text-parchment-dim">x-opencode-session</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>catalog</span>
                <span className="text-parchment-dim">{modelsSource}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost mt-3 px-0! text-[10px]!"
              onClick={() => void refreshModels(true)}
              disabled={!keyReady}
            >
              <RefreshCw className="size-3" />
              Refresh model catalog
            </button>

            <p className="mt-4 border-l border-gold/30 pl-3 text-[10px] leading-5 text-faint">
              Note: OpenCode Go is intended for coding-agent traffic. Treat it as a development/personal
              provider and keep the adapter swappable for a dedicated inference provider before shipping.
            </p>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-gold/80" />
              <SectionLabel>Model routing</SectionLabel>
            </div>
            <div className="mt-4 space-y-4">
              <ModelSelect
                label="NPC dialogue"
                value={form.ai.npcModel}
                models={models}
                onChange={(value) => updateAi("npcModel", value)}
              />
              <ModelSelect
                label="Director / quests"
                value={form.ai.directorModel}
                models={models}
                onChange={(value) => updateAi("directorModel", value)}
              />
              <ModelSelect
                label="Summarizer / repair"
                value={form.ai.summaryModel}
                models={models}
                onChange={(value) => updateAi("summaryModel", value)}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="temperature">
                    Temperature <span className="text-gold/80">{form.ai.temperature.toFixed(2)}</span>
                  </label>
                  <input
                    id="temperature"
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={form.ai.temperature}
                    onChange={(event) => updateAi("temperature", Number(event.target.value))}
                    className="mt-2 w-full accent-[#c9a35a]"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="budget">
                    Monthly budget (USD)
                  </label>
                  <input
                    id="budget"
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    className="input"
                    value={form.ai.monthlyBudgetUsd}
                    onChange={(event) => updateAi("monthlyBudgetUsd", Number(event.target.value))}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-faint">
                  <span>Spent this month</span>
                  <span className="font-mono">
                    {formatUsd(spend)} / {formatUsd(budget)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-line-soft">
                  <div className="h-full bg-gold/70" style={{ width: `${budgetPct}%` }} />
                </div>
              </div>

              <label className="flex items-center justify-between border-t border-line-soft pt-4 text-xs text-parchment-dim">
                <span>Enable AI narration</span>
                <input
                  type="checkbox"
                  checked={form.ai.aiEnabled}
                  onChange={(event) => updateAi("aiEnabled", event.target.checked)}
                  className="size-4 accent-[#c9a35a]"
                />
              </label>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-gold/80" />
              <SectionLabel>Content & presentation</SectionLabel>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="content-rating">
                  Content rating
                </label>
                <select
                  id="content-rating"
                  className="input"
                  value={form.contentRating}
                  onChange={(event) =>
                    setForm({ ...form, contentRating: event.target.value as AppSettings["contentRating"] })
                  }
                >
                  <option value="teen">Teen — fade to black</option>
                  <option value="mature">Mature — darker themes</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="difficulty">
                  Difficulty
                </label>
                <select
                  id="difficulty"
                  className="input"
                  value={form.difficulty}
                  onChange={(event) =>
                    setForm({ ...form, difficulty: event.target.value as AppSettings["difficulty"] })
                  }
                >
                  <option value="story">Story</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="graphics-quality">
                  Graphics quality
                </label>
                <select
                  id="graphics-quality"
                  className="input"
                  value={form.graphicsQuality}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      graphicsQuality: event.target.value as AppSettings["graphicsQuality"],
                    })
                  }
                >
                  <option value="low">Low — static effects, fewer props</option>
                  <option value="balanced">Balanced — animated water and weather</option>
                  <option value="high">High — full atmosphere</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="weather">
                  Weather
                </label>
                <select
                  id="weather"
                  className="input"
                  value={form.weather}
                  onChange={(event) =>
                    setForm({ ...form, weather: event.target.value as AppSettings["weather"] })
                  }
                >
                  <option value="auto">Automatic by time and place</option>
                  <option value="off">Clear skies</option>
                  <option value="rain">Rain</option>
                  <option value="snow">Snow</option>
                  <option value="fog">Fog</option>
                  <option value="storm">Storm</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ui-scale">
                  UI scale <span className="text-gold/80">{Math.round(form.uiScale * 100)}%</span>
                </label>
                <input
                  id="ui-scale"
                  type="range"
                  min={0.8}
                  max={1.5}
                  step={0.05}
                  value={form.uiScale}
                  onChange={(event) => setForm({ ...form, uiScale: Number(event.target.value) })}
                  className="mt-2 w-full accent-[#c9a35a]"
                />
              </div>
              <label className="flex items-end justify-between gap-3 pb-1 text-xs text-parchment-dim">
                <span>Reduce motion</span>
                <input
                  type="checkbox"
                  checked={form.reduceMotion}
                  onChange={(event) => setForm({ ...form, reduceMotion: event.target.checked })}
                  className="size-4 accent-[#c9a35a]"
                />
              </label>
              <label className="flex items-end justify-between gap-3 pb-1 text-xs text-parchment-dim">
                <span>High contrast</span>
                <input
                  type="checkbox"
                  checked={form.highContrast}
                  onChange={(event) => setForm({ ...form, highContrast: event.target.checked })}
                  className="size-4 accent-[#c9a35a]"
                />
              </label>
              <label className="flex items-end justify-between gap-3 pb-1 text-xs text-parchment-dim">
                <span>Show tooltips</span>
                <input
                  type="checkbox"
                  checked={form.showTooltips}
                  onChange={(event) => setForm({ ...form, showTooltips: event.target.checked })}
                  className="size-4 accent-[#c9a35a]"
                />
              </label>
            </div>
            <div className="mt-4 border-t border-line-soft pt-4">
              <SectionLabel>Audio</SectionLabel>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["masterVolume", "Master"],
                    ["sfxVolume", "Effects"],
                    ["ambienceVolume", "Ambience"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="label" htmlFor={`audio-${key}`}>
                      {label} <span className="text-gold/80">{Math.round(form.audio[key] * 100)}%</span>
                    </label>
                    <input
                      id={`audio-${key}`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={form.audio[key]}
                      onChange={(event) => updateAudio(key, Number(event.target.value))}
                      className="w-full accent-[#c9a35a]"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[9px] text-faint">
                Sounds are generated locally with WebAudio; no audio assets or remote requests.
              </p>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-faint">
              Content settings are enforced at the prompt and intent layers. They are not a substitute for
              parental controls.
            </p>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-gold/80" />
              <SectionLabel>System</SectionLabel>
            </div>
            <div className="mt-4 space-y-1.5 font-mono text-[10px] leading-5 text-faint">
              <div className="flex justify-between gap-3">
                <span>app version</span>
                <span className="text-parchment-dim">{bootstrap?.appVersion ?? "0.1.0"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>platform</span>
                <span className="text-parchment-dim">{bootstrap?.platform ?? "win32"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>local api</span>
                <span className="truncate text-parchment-dim">
                  {bootstrap ? new URL(bootstrap.apiBase).host : "127.0.0.1"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>database</span>
                <span className="text-parchment-dim">userData/iwakura.db</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>ai calls</span>
                <span className="text-parchment-dim">
                  {settings.apiKeySource === "none" ? "blocked" : "enabled"}
                </span>
              </div>
            </div>
            <div className="rule my-4" />
            <p className="text-[10px] leading-5 text-faint">
              Single-player only. No telemetry, no account, no cloud sync. Saves and AI transcripts stay in
              the local SQLite database.
            </p>
          </Panel>

          <Panel className="p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="size-4 text-gold/80" />
                <SectionLabel>Chronicle saves</SectionLabel>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn" onClick={exportCampaign} disabled={!campaign}>
                  <Download className="size-3.5" />
                  Export
                </button>
                <label className="btn cursor-pointer">
                  <Upload className="size-3.5" />
                  Import
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => void importCampaign(event.target.files?.[0])}
                  />
                </label>
                <button type="button" className="btn" onClick={() => void refreshSlots()}>
                  <RefreshCw className="size-3.5" />
                  Refresh slots
                </button>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-faint">
              The active chronicle autosaves after travel, dialogue, trade, and battle. Slots are manual
              snapshots stored in the local database.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[1, 2, 3].map((slotNumber) => {
                const slot = slots.find((entry) => entry.id === String(slotNumber));
                return (
                  <div key={slotNumber} className="border border-line-soft bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm text-parchment">Slot {slotNumber}</span>
                      <span
                        className={cn("chip text-[9px]", slot ? "border-moss/40 text-moss" : "text-faint")}
                      >
                        {slot ? "saved" : "empty"}
                      </span>
                    </div>
                    {slot ? (
                      <>
                        <div className="mt-1 truncate text-[11px] text-parchment-dim">{slot.name}</div>
                        <div className="text-[9px] text-faint">
                          {slot.worldSource} · {new Date(slot.updatedAt).toLocaleString()}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-[10px] text-faint">No snapshot yet.</div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn px-2! py-0.5! text-[9px]!"
                        onClick={() => void storeSlot(String(slotNumber))}
                        disabled={!campaign}
                      >
                        <Save className="size-3" />
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn px-2! py-0.5! text-[9px]!"
                        onClick={() => void loadSlot(String(slotNumber))}
                        disabled={!slot}
                      >
                        <FolderOpen className="size-3" />
                        Load
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost px-2! py-0.5! text-[9px]!"
                        onClick={() => void removeSlot(String(slotNumber))}
                        disabled={!slot}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
