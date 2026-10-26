import { BookOpen, Compass, Heart, Keyboard, ScrollText, Swords, X } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "../state/useAppStore";
import { Panel, SectionLabel } from "./ui";

const CONTROLS = [
  [
    "Travel Map",
    "WASD move relative to the view · Shift run · walk through gates and road edges · scroll to zoom",
  ],
  ["Atlas", "Drag to pan · inspect roads and landmarks · fast travel on known routes"],
  [
    "Local map",
    "WASD or Q/E walk relative to the view · click a hex to pathfind · step onto an exit to return",
  ],
  ["Dialogue", "Choose authored lines or ask the AI · Esc closes the conversation"],
  ["Battle", "Click a reachable hex to move · select an enemy · Attack or use an ability"],
  ["Journal", "Track objectives, rumors, faction standing, and the chronicle recap"],
];

const SYSTEMS = [
  ["Dice", "The engine rolls all checks, attacks, damage, initiative, and skill tests."],
  ["Focus", "Class abilities spend Focus. Short and long rests restore it."],
  ["Saves", "Autosave writes the active chronicle. Slots are manual snapshots in Settings."],
  ["AI", "The narrator proposes speech and intents. The engine validates every state change."],
  ["Companions", "Recruitable NPCs travel with you, fight on their turns, and react to choices."],
  ["Travel", "Each world hex unfolds into an isometric field. Visible threats start combat on contact."],
  ["Weather", "Rain, snow, fog, and storms follow time and place. Fix or disable the weather in Settings."],
  [
    "Graphics",
    "Low, balanced, and high presets change water motion, weather density, filters, and decorative props.",
  ],
  ["Content", "Teen fades romance to black; mature changes tone, not rules."],
];

export function HelpPanel() {
  const open = useAppStore((state) => state.helpOpen);
  const setOpen = useAppStore((state) => state.setHelpOpen);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close guide"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <Panel lit className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start justify-between border-b border-line-soft px-5 py-4">
          <div>
            <SectionLabel>Field guide</SectionLabel>
            <h2 className="font-display text-2xl text-parchment">How to play</h2>
            <p className="mt-0.5 text-[10px] text-faint">
              The engine owns the rules. The narrator owns the voice.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2! py-1!"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <Keyboard className="size-4 text-gold/70" />
                <SectionLabel>Controls</SectionLabel>
              </div>
              <div className="mt-2 space-y-2">
                {CONTROLS.map(([label, text]) => (
                  <div key={label} className="border border-line-soft bg-black/10 px-3 py-2">
                    <div className="font-display text-sm text-parchment">{label}</div>
                    <div className="text-[10px] leading-4 text-muted">{text}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-gold/70" />
                <SectionLabel>Systems</SectionLabel>
              </div>
              <div className="mt-2 space-y-2">
                {SYSTEMS.map(([label, text]) => (
                  <div key={label} className="border border-line-soft bg-black/10 px-3 py-2">
                    <div className="font-display text-sm text-parchment">{label}</div>
                    <div className="text-[10px] leading-4 text-muted">{text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="border border-gold/20 bg-gold/[0.04] p-3 text-center">
              <Compass className="mx-auto size-4 text-gold/70" />
              <div className="mt-1 text-[10px] text-parchment-dim">Explore</div>
              <div className="text-[9px] text-faint">World → town → dungeon</div>
            </div>
            <div className="border border-gold/20 bg-gold/[0.04] p-3 text-center">
              <ScrollText className="mx-auto size-4 text-gold/70" />
              <div className="mt-1 text-[10px] text-parchment-dim">Choose</div>
              <div className="text-[9px] text-faint">Quests branch and remember</div>
            </div>
            <div className="border border-gold/20 bg-gold/[0.04] p-3 text-center">
              <Swords className="mx-auto size-4 text-gold/70" />
              <div className="mt-1 text-[10px] text-parchment-dim">Fight</div>
              <div className="text-[9px] text-faint">Win, retreat, or fall</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border border-line-soft bg-black/10 px-3 py-2 text-[10px] text-muted">
            <Heart className="size-3.5 text-blood/70" />
            Tooltips and the field guide are always available from the header. Nothing here requires an AI
            provider.
          </div>
        </div>
      </Panel>
    </div>
  );
}
