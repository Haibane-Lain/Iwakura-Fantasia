import {
  ArrowRight,
  BookOpen,
  Coins,
  Database,
  FlaskConical,
  Hexagon,
  KeyRound,
  Map as MapIcon,
  ScrollText,
  Sparkles,
  Swords,
  Timer,
} from "lucide-react";
import { formatUsd } from "../api/client";
import { cn, Metric, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

function HeroSigil() {
  return (
    <svg
      viewBox="0 0 420 420"
      className="pointer-events-none absolute -right-24 top-1/2 size-[560px] -translate-y-1/2 text-gold opacity-[0.12]"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <g strokeWidth="1">
        <polygon points="210,24 371,117 371,303 210,396 49,303 49,117" />
        <polygon points="210,64 339,139 339,281 210,356 81,281 81,139" />
        <polygon points="210,106 305,161 305,259 210,314 115,259 115,161" />
        <path d="M210 24V396M49 117L371 303M371 117L49 303" strokeOpacity="0.35" />
        <circle cx="210" cy="210" r="150" strokeDasharray="2 12" strokeOpacity="0.5" />
      </g>
    </svg>
  );
}

function RoadmapRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "done" | "active" | "later";
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          "mt-1 grid size-4 shrink-0 place-items-center rounded-full border",
          status === "done" && "border-moss/60 bg-moss/15 text-moss",
          status === "active" && "border-gold/60 bg-gold/15 text-gold-bright",
          status === "later" && "border-line text-faint",
        )}
      >
        {status === "done" ? "✓" : status === "active" ? "◆" : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-xs", status === "later" ? "text-faint" : "text-parchment-dim")}>{label}</div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-faint">{detail}</div>
      </div>
    </div>
  );
}

export function MainMenu() {
  const setScreen = useAppStore((state) => state.setScreen);
  const health = useAppStore((state) => state.health);
  const settings = useAppStore((state) => state.settings);
  const modelsSource = useAppStore((state) => state.modelsSource);
  const bootstrap = useAppStore((state) => state.bootstrap);

  const providerReady = settings?.apiKeyConfigured ?? false;
  const spend = settings?.spendThisMonthUsd ?? 0;
  const budget = settings?.settings.ai.monthlyBudgetUsd ?? 0;

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 hex-field opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_25%_15%,rgba(201,163,90,0.08),transparent_55%)]" />
      <HeroSigil />

      <div className="relative mx-auto grid min-h-full max-w-6xl grid-cols-1 gap-10 px-8 py-14 lg:grid-cols-[1.35fr_0.85fr] lg:items-center">
        <section className="animate-fade-up">
          <div className="mb-5 flex items-center gap-3">
            <SectionLabel>A single-player chronicle</SectionLabel>
            <span className="h-px w-16 bg-line" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-gold/70">M0 · Foundation</span>
          </div>

          <h1 className="font-display text-6xl leading-[0.92] tracking-[0.02em] text-parchment text-balance md:text-7xl xl:text-[5.4rem]">
            Iwakura
            <span className="block text-gold-bright/90">Fantasia</span>
          </h1>

          <p className="mt-6 max-w-xl text-sm leading-6 text-parchment-dim">
            A hexbound realm of old roads and older debts. Build a character, gather companions, and let a
            careful narrator remember what you did to whom. The rules are deterministic. The story is not.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled title="No saved chronicles yet">
              <ScrollText className="size-3.5" />
              Continue
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setScreen("campaign")}>
              <Sparkles className="size-3.5" />
              New campaign
            </button>
            <button type="button" className="btn" onClick={() => setScreen("lab")}>
              <FlaskConical className="size-3.5" />
              AI lab
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setScreen("settings")}>
              <KeyRound className="size-3.5" />
              Settings
            </button>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.14em] text-faint">
            <span className="flex items-center gap-1.5">
              <Swords className="size-3" /> Tactical hex combat
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="size-3" /> Evolving quests
            </span>
            <span className="flex items-center gap-1.5">
              <MapIcon className="size-3" /> Procedural or handcrafted
            </span>
          </div>
        </section>

        <aside className="animate-fade-up space-y-4 [animation-delay:120ms]">
          <Panel lit className="p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Chronicle status</SectionLabel>
              <span className="chip">
                <StatusDot tone={health?.ok ? "ok" : "bad"} />
                {health?.ok ? "Online" : "Offline"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <Metric
                label="Database"
                value={health?.database === "ok" ? "SQLite · WAL" : "Unavailable"}
                hint={`${health?.uptimeSeconds ?? 0}s uptime`}
              />
              <Metric
                label="Provider"
                value={providerReady ? "OpenCode Go" : "Not configured"}
                hint={settings?.apiKeySource ?? "none"}
              />
              <Metric label="Model catalog" value={modelsSource} hint="24h cache" />
              <Metric label="Budget" value={`${formatUsd(spend)} / ${formatUsd(budget)}`} hint="this month" />
            </div>

            <div className="rule my-4" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <Coins className="size-3.5 text-gold/70" />
                <span className="truncate">
                  {providerReady
                    ? "Narration is ready. Start in the AI Lab."
                    : "Add an OpenCode Go key in Settings to wake the narrator."}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost shrink-0 px-2! py-1! text-[10px]!"
                onClick={() => setScreen(providerReady ? "lab" : "settings")}
              >
                {providerReady ? "Open" : "Fix"}
                <ArrowRight className="size-3" />
              </button>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Road to the slice</SectionLabel>
              <span className="font-mono text-[10px] text-faint">M0 / M7</span>
            </div>
            <div className="mt-2 divide-y divide-line-soft/60">
              <RoadmapRow label="Foundation, local server, AI gateway" status="active" detail="In progress" />
              <RoadmapRow label="Hex world, fog, travel" status="later" detail="M1" />
              <RoadmapRow label="Character creation, content" status="later" detail="M2" />
              <RoadmapRow label="Towns, NPCs, quests" status="later" detail="M3" />
              <RoadmapRow label="Tactical battle maps" status="later" detail="M4" />
              <RoadmapRow label="AI NPCs, memory, Director" status="later" detail="M5–M6" />
            </div>
          </Panel>

          <div className="flex items-center justify-between px-1 text-[10px] text-faint">
            <span className="flex items-center gap-1.5">
              <Database className="size-3" /> local-first
            </span>
            <span className="flex items-center gap-1.5">
              <Timer className="size-3" /> turn-based
            </span>
            <span className="flex items-center gap-1.5">
              <Hexagon className="size-3" /> {bootstrap?.platform ?? "desktop"}
            </span>
          </div>
        </aside>
      </div>

      <footer className="relative border-t border-line-soft/60 px-8 py-4 text-center text-[10px] uppercase tracking-[0.24em] text-faint">
        “The road remembers what the map forgets.”
      </footer>
    </div>
  );
}
