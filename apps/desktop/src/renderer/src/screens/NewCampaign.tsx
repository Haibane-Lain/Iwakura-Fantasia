import { HANDCRAFTED_WORLDS } from "@iwakura/content";
import type { WorldGenParams, WorldGenRequest, WorldGenResult } from "@iwakura/contracts";
import { createGameState } from "@iwakura/engine";
import {
  AlertTriangle,
  ArrowLeft,
  Compass,
  Dice5,
  FileJson,
  Hammer,
  Loader2,
  Map as MapIcon,
  Mountain,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { WorldPreview } from "../components/WorldPreview";
import { generateWorldAsync } from "../game/worldgen-client";
import { useAppStore } from "../state/useAppStore";

const SEED_WORDS = [
  "ashen",
  "verdant",
  "grey",
  "sunken",
  "whispering",
  "golden",
  "broken",
  "old",
  "quiet",
  "red",
  "pale",
  "thorn",
];

function randomSeed(): string {
  const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
  const b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
  return `${a}-${b}-${Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0")}`;
}

const DEFAULT_PARAMS: WorldGenParams = {
  width: 96,
  height: 96,
  seaLevel: 0.42,
  climate: "varied",
  magicLevel: "standard",
  danger: "normal",
  settlementDensity: 0.5,
};

function ReportList({ title, items, tone }: { title: string; items: string[]; tone: "error" | "warning" }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className={cn("kicker", tone === "error" ? "text-[#d9a39d]" : "text-gold/80")}>
        {title} · {items.length}
      </div>
      <ul className="mt-1 space-y-1">
        {items.slice(0, 6).map((item) => (
          <li
            key={item}
            className={cn(
              "flex gap-2 text-[11px] leading-5",
              tone === "error" ? "text-[#e0b0aa]" : "text-parchment-dim",
            )}
          >
            <AlertTriangle className="mt-1 size-3 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {items.length > 6 ? (
        <div className="mt-1 text-[10px] text-faint">and {items.length - 6} more…</div>
      ) : null}
    </div>
  );
}

export function NewCampaign() {
  const setScreen = useAppStore((state) => state.setScreen);
  const campaign = useAppStore((state) => state.campaign);
  const appSettings = useAppStore((state) => state.settings);
  const saveCampaign = useAppStore((state) => state.saveCampaign);

  const [source, setSource] = useState<"procedural" | "handcrafted">("procedural");
  const [seed, setSeed] = useState(randomSeed);
  const [params, setParams] = useState<WorldGenParams>(DEFAULT_PARAMS);
  const [packId, setPackId] = useState(HANDCRAFTED_WORLDS[0]?.id ?? "core:redford_reach");
  const [result, setResult] = useState<WorldGenResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [beginning, setBeginning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoGenerate = useRef(false);

  const autoGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const request: WorldGenRequest = {
        source: "procedural",
        seed,
        params: DEFAULT_PARAMS,
      };
      const generated = await generateWorldAsync(request);
      setResult(generated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  }, [seed]);

  useEffect(() => {
    if (didAutoGenerate.current) return;
    didAutoGenerate.current = true;
    void autoGenerate();
  }, [autoGenerate]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const request: WorldGenRequest = {
        source,
        seed: source === "handcrafted" ? packId : seed,
        params,
        packId: source === "handcrafted" ? packId : undefined,
      };
      const generated = await generateWorldAsync(request);
      setResult(generated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  };

  const begin = async () => {
    if (!result || result.report.errors.length > 0) return;
    if (
      campaign &&
      !window.confirm("Starting a new chronicle will replace the current campaign. Continue?")
    ) {
      return;
    }
    setBeginning(true);
    setError(null);
    try {
      const state = createGameState({
        world: result.world,
        settings: {
          worldSource: result.world.source,
          worldPackId: result.world.packId,
          seed: result.world.seed,
          genParams: params,
          difficulty: appSettings?.settings.difficulty ?? "normal",
          contentRating: appSettings?.settings.contentRating ?? "teen",
          aiEnabled: appSettings?.settings.ai.aiEnabled ?? true,
        },
        campaignId: crypto.randomUUID(),
        campaignName: result.world.name,
      });
      await saveCampaign(state);
      setScreen("world");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBeginning(false);
    }
  };

  const updateParam = <K extends keyof WorldGenParams>(key: K, value: WorldGenParams[K]) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  const selectedPack = HANDCRAFTED_WORLDS.find((pack) => pack.id === packId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <button type="button" className="btn btn-ghost px-0! text-[10px]!" onClick={() => setScreen("menu")}>
          <ArrowLeft className="size-3" />
          Back to chronicle
        </button>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionLabel>World options</SectionLabel>
            <h1 className="mt-2 font-display text-4xl tracking-wide text-parchment">New Chronicle</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              Generate a realm that obeys its own geography, or begin in an authored valley. Every world must
              pass the same plausibility checks before it can be played.
            </p>
          </div>
          <span className="chip">
            <StatusDot tone={result?.report.passed ? "ok" : "warn"} />
            M1 · World generation
          </span>
        </div>

        {campaign ? (
          <div className="mt-5 flex items-start gap-2 border border-gold/30 bg-gold/[0.04] px-3 py-2 text-[11px] leading-5 text-parchment-dim">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" />
            Starting a new chronicle replaces <span className="text-parchment">{campaign.campaign.name}</span>
            . The current save will be overwritten when you press{" "}
            <span className="text-parchment">Begin chronicle</span>.
          </div>
        ) : null}

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <Panel lit className="p-5">
              <SectionLabel>Source</SectionLabel>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    "border p-4 text-left transition-colors",
                    source === "procedural"
                      ? "border-gold/60 bg-gold/[0.06]"
                      : "border-line-soft bg-black/10 hover:border-line",
                  )}
                  onClick={() => {
                    setSource("procedural");
                    setResult(null);
                  }}
                >
                  <span className="flex items-center gap-2 font-display text-lg text-parchment">
                    <Mountain className="size-4 text-gold/80" />
                    Procedural
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted">
                    Seeded terrain, rivers, settlements, and roads under hard plausibility rules.
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "border p-4 text-left transition-colors",
                    source === "handcrafted"
                      ? "border-gold/60 bg-gold/[0.06]"
                      : "border-line-soft bg-black/10 hover:border-line",
                  )}
                  onClick={() => {
                    setSource("handcrafted");
                    setResult(null);
                  }}
                >
                  <span className="flex items-center gap-2 font-display text-lg text-parchment">
                    <ScrollText className="size-4 text-gold/80" />
                    Handcrafted
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted">
                    An authored valley with named roads, a town, a village, and a sealed crypt.
                  </span>
                </button>
              </div>

              {source === "procedural" ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="label" htmlFor="world-seed">
                      Seed
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="world-seed"
                        className="input font-mono text-xs"
                        value={seed}
                        onChange={(event) => setSeed(event.target.value)}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="btn shrink-0 px-3!"
                        title="Roll a new seed"
                        onClick={() => {
                          const next = randomSeed();
                          setSeed(next);
                          setResult(null);
                        }}
                      >
                        <Dice5 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label" htmlFor="world-size">
                        World size
                      </label>
                      <select
                        id="world-size"
                        className="input"
                        value={params.width}
                        onChange={(event) => {
                          const size = Number(event.target.value);
                          setParams((current) => ({ ...current, width: size, height: size }));
                        }}
                      >
                        <option value={64}>Small · 64×64</option>
                        <option value={96}>Standard · 96×96</option>
                        <option value={128}>Large · 128×128</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="world-climate">
                        Climate
                      </label>
                      <select
                        id="world-climate"
                        className="input"
                        value={params.climate}
                        onChange={(event) =>
                          updateParam("climate", event.target.value as WorldGenParams["climate"])
                        }
                      >
                        <option value="varied">Varied</option>
                        <option value="temperate">Temperate</option>
                        <option value="cold">Cold</option>
                        <option value="warm">Warm</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="world-sea">
                      Sea level <span className="text-gold/80">{Math.round(params.seaLevel * 100)}%</span>
                    </label>
                    <input
                      id="world-sea"
                      type="range"
                      min={0.32}
                      max={0.56}
                      step={0.01}
                      value={params.seaLevel}
                      onChange={(event) => updateParam("seaLevel", Number(event.target.value))}
                      className="w-full accent-[#c9a35a]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label" htmlFor="world-danger">
                        Danger
                      </label>
                      <select
                        id="world-danger"
                        className="input"
                        value={params.danger}
                        onChange={(event) =>
                          updateParam("danger", event.target.value as WorldGenParams["danger"])
                        }
                      >
                        <option value="peaceful">Peaceful</option>
                        <option value="normal">Normal</option>
                        <option value="deadly">Deadly</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="world-density">
                        Settlements{" "}
                        <span className="text-gold/80">{Math.round(params.settlementDensity * 100)}%</span>
                      </label>
                      <input
                        id="world-density"
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={params.settlementDensity}
                        onChange={(event) => updateParam("settlementDensity", Number(event.target.value))}
                        className="mt-2 w-full accent-[#c9a35a]"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div>
                    <label className="label" htmlFor="world-pack">
                      World pack
                    </label>
                    <select
                      id="world-pack"
                      className="input"
                      value={packId}
                      onChange={(event) => {
                        setPackId(event.target.value);
                        setResult(null);
                      }}
                    >
                      {HANDCRAFTED_WORLDS.map((pack) => (
                        <option key={pack.id} value={pack.id}>
                          {pack.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] leading-5 text-muted">{selectedPack?.description}</p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-faint">
                    <span className="chip">
                      {selectedPack?.width}×{selectedPack?.height}
                    </span>
                    <span className="chip">{selectedPack?.pois.length} landmarks</span>
                    <span className="chip">authored</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary mt-5 w-full"
                onClick={() => void generate()}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {generating ? "Shaping the land…" : "Generate world"}
              </button>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-gold/80" />
                <SectionLabel>Plausibility rules</SectionLabel>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                Rivers run downhill to water. Settlements sit near fresh water and arable land. Roads connect
                every settlement. Faction borders are not yet simulated; they arrive with towns in M3.
              </p>
              <div className="mt-3 grid gap-1.5 text-[10px] leading-5 text-faint">
                <span>✓ connected landmass and coastal shading</span>
                <span>✓ river termination and lake formation</span>
                <span>✓ settlement water, spacing, and road checks</span>
                <span>✓ dungeon placement in hills and mountains</span>
              </div>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
                <div className="flex items-center gap-2">
                  <MapIcon className="size-3.5 text-gold/70" />
                  <SectionLabel>Preview</SectionLabel>
                </div>
                <span className="font-mono text-[10px] text-faint">
                  {result ? `${result.world.source} · ${result.world.seed}` : "awaiting seed"}
                </span>
              </div>
              <div className="relative h-[360px] bg-black/30">
                {result ? (
                  <WorldPreview world={result.world} className="size-full" />
                ) : (
                  <div className="grid size-full place-items-center">
                    {generating ? (
                      <div className="flex flex-col items-center gap-3 text-xs text-muted">
                        <Compass className="size-8 animate-spin text-gold/50 [animation-duration:6s]" />
                        Shaping the land…
                      </div>
                    ) : (
                      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                        <MapIcon className="size-8 text-gold/30" strokeWidth={1} />
                        <p className="text-xs leading-5 text-faint">
                          Choose a source and generate a world. The preview shows terrain, rivers, roads, and
                          landmarks.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {result ? (
                <div className="grid grid-cols-3 gap-3 border-t border-line-soft px-5 py-3 text-[10px] sm:grid-cols-6">
                  <div>
                    <div className="kicker">Land</div>
                    <div className="font-mono text-parchment-dim">{result.report.stats.landTiles}</div>
                  </div>
                  <div>
                    <div className="kicker">Water</div>
                    <div className="font-mono text-parchment-dim">{result.report.stats.waterTiles}</div>
                  </div>
                  <div>
                    <div className="kicker">Towns</div>
                    <div className="font-mono text-parchment-dim">{result.report.stats.settlements}</div>
                  </div>
                  <div>
                    <div className="kicker">Dungeons</div>
                    <div className="font-mono text-parchment-dim">{result.report.stats.dungeons}</div>
                  </div>
                  <div>
                    <div className="kicker">Rivers</div>
                    <div className="font-mono text-parchment-dim">{result.report.stats.rivers}</div>
                  </div>
                  <div>
                    <div className="kicker">Roads</div>
                    <div className="font-mono text-parchment-dim">{result.report.stats.roads}</div>
                  </div>
                </div>
              ) : null}
            </Panel>

            {error ? (
              <div className="flex items-start gap-2 border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-[#e0b0aa]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {result ? (
              <Panel lit={result.report.passed} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileJson className="size-3.5 text-gold/70" />
                    <SectionLabel>World report</SectionLabel>
                  </div>
                  <span
                    className={cn(
                      "chip",
                      result.report.passed
                        ? "border-moss/40 text-[#c6d1a4]"
                        : "border-blood/40 text-[#e0b0aa]",
                    )}
                  >
                    <StatusDot tone={result.report.passed ? "ok" : "bad"} />
                    {result.report.passed ? "passed" : "blocked"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  {result.report.passed
                    ? `${result.world.name} passed all hard checks. ${result.world.pois.length} landmarks were placed.`
                    : "This world cannot be entered until the hard errors are resolved. Try another seed, or lower the sea level."}
                </p>
                <ReportList
                  title="Errors"
                  tone="error"
                  items={result.report.errors.map((issue) => issue.message)}
                />
                <ReportList
                  title="Warnings"
                  tone="warning"
                  items={result.report.warnings.map((issue) => issue.message)}
                />
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={() => void begin()}
                    disabled={!result.report.passed || beginning}
                  >
                    {beginning ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {beginning ? "Opening the chronicle…" : "Begin chronicle"}
                  </button>
                  <button type="button" className="btn" onClick={() => void generate()} disabled={generating}>
                    <Hammer className="size-3.5" />
                    Reroll
                  </button>
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
