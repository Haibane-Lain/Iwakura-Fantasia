import {
  ArrowLeft,
  Check,
  Compass,
  FileJson,
  Hammer,
  type LucideIcon,
  Mountain,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

const SLICE_ITEMS = [
  "Character creation: 3 ancestries, 3 classes, 3 backgrounds",
  "One handcrafted region and one procedural preset",
  "A town with five named NPCs and a merchant",
  "A dungeon with three encounters and a boss",
  "One evolving main quest and one side quest",
  "One recruitable companion with combat AI",
  "Two tactical battles, including a retreat",
  "Save, reload, and AI-offline fallback",
];

function WorldCard({
  title,
  icon: Icon,
  description,
  bullets,
  tag,
  recommended,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
  bullets: string[];
  tag: string;
  recommended?: boolean;
}) {
  return (
    <Panel lit={recommended} className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center border border-line bg-black/20 text-gold/80">
          <Icon className="size-5" strokeWidth={1.3} />
        </span>
        <div className="flex items-center gap-2">
          {recommended ? <span className="chip border-gold/40 text-gold-bright">recommended</span> : null}
          <span className="chip">{tag}</span>
        </div>
      </div>
      <h2 className="mt-5 font-display text-2xl tracking-wide text-parchment">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
      <ul className="mt-5 space-y-2.5 text-[11px] leading-5 text-parchment-dim">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <Check className="mt-0.5 size-3 shrink-0 text-moss" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <button type="button" className="btn w-full" disabled>
          <Hammer className="size-3.5" />
          Arrives in M1
        </button>
      </div>
    </Panel>
  );
}

export function NewCampaign() {
  const setScreen = useAppStore((state) => state.setScreen);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <button type="button" className="btn btn-ghost px-0! text-[10px]!" onClick={() => setScreen("menu")}>
          <ArrowLeft className="size-3" />
          Back to chronicle
        </button>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionLabel>World options</SectionLabel>
            <h1 className="mt-2 font-display text-4xl tracking-wide text-parchment">New Chronicle</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              The realm can be authored by hand or grown from a seed. Either way it uses the same rules, the
              same save format, and the same validation report.
            </p>
          </div>
          <span className="chip">
            <StatusDot tone="warn" />
            M1 · World generation
          </span>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <WorldCard
            title="Handcrafted"
            icon={ScrollText}
            tag="world pack"
            description="A designed region with authored towns, roads, dungeons, factions, and quest hooks. Best for the vertical slice and for stories with a fixed shape."
            bullets={[
              "Curated geography and points of interest",
              "Named NPCs, factions, and quest chains",
              "Same schema and validators as procedural",
              "Pack version recorded in the save",
            ]}
          />
          <WorldCard
            title="Procedural"
            icon={Mountain}
            tag="seeded"
            recommended
            description="A generated realm that still obeys physical and settlement logic: rivers run downhill, towns need water and arable land, ports need harbors, and roads follow the land."
            bullets={[
              "Elevation, climate, rivers, biomes, coastlines",
              "Settlement suitability and road networks",
              "14 hard plausibility rules + repair pass",
              "Seeded, previewable, and rerollable",
            ]}
          />
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-gold/80" />
              <SectionLabel>First playable slice</SectionLabel>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              The slice is the gate. If this is not fun, more content will not save it.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SLICE_ITEMS.map((item) => (
                <div
                  key={item}
                  className="flex gap-2 border border-line-soft bg-black/10 px-3 py-2 text-[11px] leading-5 text-parchment-dim"
                >
                  <Check className="mt-1 size-3 shrink-0 text-gold/60" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <FileJson className="size-4 text-gold/80" />
                <SectionLabel>World report</SectionLabel>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                Generated worlds are checked before they can be accepted. Hard errors block creation; warnings
                can be accepted.
              </p>
              <div className="mt-3 border border-line-soft bg-black/30 p-3 font-mono text-[10px] leading-5">
                <div className="text-moss">✓ rivers terminate at sea or lake</div>
                <div className="text-moss">✓ every town has fresh water + arable land</div>
                <div className="text-moss">✓ road network connects all settlements</div>
                <div className="text-moss">✓ faction territories contiguous</div>
                <div className="text-gold/80">! one hamlet is 7 hexes from the nearest road</div>
                <div className="text-faint">repair: rerouting road through the ford…</div>
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-gold/80" />
                <SectionLabel>Same rules everywhere</SectionLabel>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                A handcrafted pack and a generated realm both pass the same content loader, state schema, and
                battle-map derivation. No special paths to maintain.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-faint">
                <Sparkles className="size-3 text-gold/60" />
                Deterministic seeds make bug reports reproducible.
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
