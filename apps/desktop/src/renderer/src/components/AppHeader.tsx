import { FlaskConical, Hexagon, Map as MapIcon, Settings, Sparkles } from "lucide-react";
import { type Screen, useAppStore } from "../state/useAppStore";
import { cn } from "./ui";

const NAV: Array<{ id: Screen; label: string; icon: typeof MapIcon }> = [
  { id: "menu", label: "Chronicle", icon: MapIcon },
  { id: "campaign", label: "New Campaign", icon: Sparkles },
  { id: "lab", label: "AI Lab", icon: FlaskConical },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AppHeader() {
  const screen = useAppStore((state) => state.screen);
  const setScreen = useAppStore((state) => state.setScreen);
  const health = useAppStore((state) => state.health);
  const settings = useAppStore((state) => state.settings);
  const bootstrap = useAppStore((state) => state.bootstrap);

  const keyReady = settings?.apiKeyConfigured ?? false;

  return (
    <header className="drag-region relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-line-soft bg-ink/80 px-5 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="no-drag group flex items-center gap-3 text-left"
          onClick={() => setScreen("menu")}
          aria-label="Return to main menu"
        >
          <span className="relative grid size-9 place-items-center">
            <Hexagon
              className="absolute size-9 text-gold/45 transition-colors group-hover:text-gold/70"
              strokeWidth={1}
            />
            <span className="relative font-display text-[11px] tracking-[0.08em] text-gold-bright">IF</span>
          </span>
          <span className="hidden sm:block">
            <span className="block font-display text-sm tracking-[0.24em] text-parchment">
              IWAKURA FANTASIA
            </span>
            <span className="block text-[8px] uppercase tracking-[0.34em] text-faint">
              A hexbound chronicle
            </span>
          </span>
        </button>
      </div>

      <nav className="no-drag hidden items-center gap-7 md:flex" aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={cn("nav-link flex items-center gap-1.5", screen === item.id && "nav-link-active")}
              onClick={() => setScreen(item.id)}
            >
              <Icon className="size-3" strokeWidth={1.5} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="no-drag flex items-center gap-3">
        <span className="chip hidden lg:inline-flex">
          <span className={cn("size-1.5 rounded-full", health?.ok ? "bg-moss" : "bg-blood")} />
          Local engine
        </span>
        <span className="chip hidden xl:inline-flex">
          <span className={cn("size-1.5 rounded-full", keyReady ? "bg-gold" : "bg-faint")} />
          {keyReady ? "OpenCode Go ready" : "Key needed"}
        </span>
        <span className="font-mono text-[10px] text-faint">
          {bootstrap ? `v${bootstrap.appVersion}` : "v0.1.0"}
        </span>
      </div>
    </header>
  );
}
