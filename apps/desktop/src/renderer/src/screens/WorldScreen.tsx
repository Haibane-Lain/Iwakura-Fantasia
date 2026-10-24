import { getTerrain } from "@iwakura/content";
import type { Hex } from "@iwakura/contracts";
import {
  battleEnemiesForEncounter,
  enterLocalMap,
  enterTravelMap,
  fastTravel,
  formatClock,
  nearbyPois,
  pathBetween,
  poiAt,
  startBattle,
  terrainAt,
  timeOfDay,
} from "@iwakura/engine";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Clock3,
  Coins,
  Compass,
  DoorOpen,
  Footprints,
  Map as MapIcon,
  Menu,
  Save,
  Sparkles,
  Swords,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CharacterSheet } from "../components/CharacterSheet";
import { QuestJournal } from "../components/QuestJournal";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { WorldCanvas } from "../components/WorldCanvas";
import { useAppStore } from "../state/useAppStore";
import { BattleScreen } from "./BattleScreen";
import { LocalScreen } from "./LocalScreen";
import { TravelScreen } from "./TravelScreen";

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function WorldScreen() {
  const campaign = useAppStore((state) => state.campaign);
  const campaignSaveState = useAppStore((state) => state.campaignSaveState);
  const campaignUpdatedAt = useAppStore((state) => state.campaignUpdatedAt);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const setScreen = useAppStore((state) => state.setScreen);
  const worldMode = useAppStore((state) => state.worldMode);
  const setWorldMode = useAppStore((state) => state.setWorldMode);

  const [selectedHex, setSelectedHex] = useState<Hex | null>(campaign?.party.position ?? null);
  const [toast, setToast] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [pendingEncounter, setPendingEncounter] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    if (!campaign) setScreen("campaign");
  }, [campaign, setScreen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const info = useMemo(() => {
    if (!campaign || !selectedHex) return null;
    const terrainId = terrainAt(campaign.world, selectedHex);
    const terrain = getTerrain(terrainId);
    const poi = poiAt(campaign.world, selectedHex);
    const route = pathBetween(campaign.world, campaign.party.position, selectedHex);
    return { terrain, poi, route };
  }, [campaign, selectedHex]);

  const nearby = useMemo(() => {
    if (!campaign) return [];
    return nearbyPois(campaign.world, campaign.party.position, 10).filter((poi) => poi.discovered);
  }, [campaign]);

  if (!campaign) return null;
  if (campaign.battle) return <BattleScreen />;
  if (campaign.local) return <LocalScreen />;
  if (campaign.travel && worldMode === "travel") return <TravelScreen />;

  const world = campaign.world;
  const party = campaign.party;
  const player = campaign.entities.player;
  const currentPoi = poiAt(world, party.position);
  const currentTerrain = getTerrain(terrainAt(world, party.position));

  const travel = (hex: Hex) => {
    const result = fastTravel(campaign, hex);
    if (!result) {
      setToast({ tone: "warn", text: "No known route to that destination." });
      return;
    }
    setSelectedHex(hex);
    const next = result.state;
    setWorldMode(next.travel ? "travel" : "atlas");
    void saveCampaign(next);
    setToast({ tone: "info", text: result.message });
  };

  const walkHere = () => {
    const entered = enterTravelMap(campaign);
    if (!entered) {
      setToast({ tone: "warn", text: "This ground cannot be walked from here." });
      return;
    }
    setWorldMode("travel");
    void saveCampaign(entered.state);
  };

  const returnToTravel = () => {
    setWorldMode("travel");
  };

  const enterLocal = (poiId: string) => {
    const base = campaign.travel ? { ...campaign, travel: undefined } : campaign;
    const result = enterLocalMap(base, poiId);
    if (!result) {
      setToast({ tone: "warn", text: "That place cannot be entered." });
      return;
    }
    void saveCampaign(result.state);
  };

  const fightRoadEncounter = () => {
    if (!pendingEncounter) return;
    const next = startBattle(campaign, {
      enemyIds: battleEnemiesForEncounter(pendingEncounter.id),
      source: "travel",
    });
    if (!next) return;
    setPendingEncounter(null);
    void saveCampaign(next);
  };

  const saveLabel =
    campaignSaveState === "saving"
      ? "Saving…"
      : campaignSaveState === "error"
        ? "Save failed"
        : campaignUpdatedAt
          ? `Saved ${new Date(campaignUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Not saved yet";

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0 right-[348px]">
        <WorldCanvas
          key={campaign.campaign.id}
          world={world}
          partyHex={party.position}
          onTravel={travel}
          onHover={setSelectedHex}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,0.55),transparent_22%,transparent_72%,rgba(8,7,6,0.6))]" />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-4">
        <Panel className="pointer-events-auto flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            className="btn btn-ghost px-1.5! py-1!"
            onClick={() => setScreen("menu")}
            title="Main menu"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapIcon className="size-3.5 text-gold/70" />
              <span className="truncate font-display text-base tracking-wide text-parchment">
                {campaign.campaign.name}
              </span>
              <span className="chip border-gold/30 text-[9px] text-gold/80">M8</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {world.name} · seed {world.seed}
            </div>
            {player ? (
              <button
                type="button"
                className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] text-gold/70 hover:text-gold-bright"
                onClick={() => setSheetOpen(true)}
              >
                <UserRound className="size-2.5" />
                {player.name} · HP {player.hp.current}/{player.hp.max} · AC {player.ac}
              </button>
            ) : null}
            {currentPoi && ["town", "village", "dungeon"].includes(currentPoi.kind) ? (
              <button
                type="button"
                className="btn mt-1.5 px-2! py-1! text-[9px]!"
                onClick={() => enterLocal(currentPoi.id)}
              >
                <DoorOpen className="size-3" />
                Enter {currentPoi.name}
              </button>
            ) : null}
            {campaign.travel ? (
              <button type="button" className="btn mt-1.5 px-2! py-1! text-[9px]!" onClick={returnToTravel}>
                <Footprints className="size-3" />
                Return to Travel Map
              </button>
            ) : (
              <button type="button" className="btn mt-1.5 px-2! py-1! text-[9px]!" onClick={walkHere}>
                <Footprints className="size-3" />
                Walk the wilds
              </button>
            )}
          </div>
        </Panel>

        <Panel className="pointer-events-auto flex items-center gap-5 px-4 py-2">
          <div className="flex items-center gap-2">
            <Clock3 className="size-3.5 text-gold/70" />
            <div>
              <div className="font-mono text-[11px] text-parchment">{formatClock(campaign.clock)}</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">
                {timeOfDay(campaign.clock)}
              </div>
            </div>
          </div>
          <div className="h-8 w-px bg-line-soft" />
          <div className="flex items-center gap-2">
            <Coins className="size-3.5 text-gold/70" />
            <div>
              <div className="font-mono text-[11px] text-parchment">{party.gold} gp</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">purse</div>
            </div>
          </div>
          <div className="h-8 w-px bg-line-soft" />
          <div className="flex items-center gap-2">
            <StatusDot
              tone={campaignSaveState === "error" ? "bad" : campaignSaveState === "saving" ? "warn" : "ok"}
            />
            <div>
              <div className="text-[11px] text-parchment-dim">{saveLabel}</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">local save</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="absolute bottom-4 left-4 right-[356px] flex items-end justify-between gap-4">
        <Panel className="pointer-events-auto px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <Compass className="size-3.5 text-gold/60" />
            <span>Drag to pan · scroll to zoom · click a hex to inspect · fast travel on known routes</span>
          </div>
          <div className="mt-1 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
            <span className="flex items-center gap-1">
              <Footprints className="size-3" />
              {currentTerrain.name}
            </span>
            <span>
              hex {party.position.q}, {party.position.r}
            </span>
            <span className="text-parchment-dim">
              {player?.name ?? "Wanderer"} · level {player?.level ?? 1}
            </span>
          </div>
        </Panel>
        <div className="pointer-events-none flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-faint">
          <span className="size-1.5 rounded-full bg-gold/70" />
          party
        </div>
      </div>

      <aside className="absolute bottom-4 right-4 top-[76px] flex w-[332px] flex-col gap-3 overflow-y-auto pr-1">
        {pendingEncounter ? (
          <Panel className="border-gold/45 p-4">
            <div className="flex items-center gap-2">
              <Swords className="size-4 text-gold" />
              <SectionLabel>Ambush</SectionLabel>
            </div>
            <div className="mt-1 font-display text-lg text-parchment">{pendingEncounter.name}</div>
            <p className="mt-1 text-[10px] leading-5 text-muted">{pendingEncounter.description}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={fightRoadEncounter}
                aria-label={`Fight ${pendingEncounter.name}`}
              >
                <Swords className="size-3.5" />
                Fight
              </button>
              <button
                type="button"
                className="btn flex-1"
                onClick={() => setPendingEncounter(null)}
                aria-label={`Avoid ${pendingEncounter.name}`}
              >
                <Footprints className="size-3.5" />
                Avoid
              </button>
            </div>
          </Panel>
        ) : null}
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Selected hex</SectionLabel>
            {selectedHex ? (
              <button
                type="button"
                className="btn btn-ghost px-1.5! py-0.5!"
                onClick={() => setSelectedHex(null)}
                title="Clear selection"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          {!selectedHex || !info ? (
            <p className="mt-3 text-[11px] leading-5 text-faint">
              Hover or click a hex to inspect terrain, landmarks, and travel cost.
            </p>
          ) : (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <div>
                  <div className="font-display text-lg text-parchment">{info.terrain.name}</div>
                  <div className="font-mono text-[10px] text-faint">
                    {selectedHex.q}, {selectedHex.r}
                  </div>
                </div>
                <span className="chip">
                  {info.terrain.movementCost === null ? "impassable" : `cost ${info.terrain.movementCost}`}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">{info.terrain.description}</p>

              {info.poi?.discovered ? (
                <div className="mt-3 border border-gold/20 bg-gold/[0.04] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3 text-gold/70" />
                    <span className="font-display text-sm text-parchment">{info.poi.name}</span>
                    <span className="chip ml-auto">{kindLabel(info.poi.kind)}</span>
                  </div>
                  {info.poi.description ? (
                    <p className="mt-1 text-[10px] leading-5 text-muted">{info.poi.description}</p>
                  ) : null}
                  {selectedHex.q === party.position.q &&
                  selectedHex.r === party.position.r &&
                  ["town", "village", "dungeon"].includes(info.poi.kind) ? (
                    <button
                      type="button"
                      className="btn btn-primary mt-2 w-full"
                      onClick={() => enterLocal(info.poi!.id)}
                    >
                      <Footprints className="size-3.5" />
                      Enter {info.poi.kind === "dungeon" ? "dungeon" : info.poi.kind}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
                <div className="text-[10px] text-faint">
                  {selectedHex.q === party.position.q && selectedHex.r === party.position.r
                    ? "The party is here."
                    : info.route
                      ? `${info.route.path.length} hexes · ${Math.max(10, info.route.cost * 10)} min`
                      : "No land route from the party."}
                </div>
                <button
                  type="button"
                  className="btn px-3! py-1.5!"
                  disabled={
                    !info.route || (selectedHex.q === party.position.q && selectedHex.r === party.position.r)
                  }
                  onClick={() => travel(selectedHex)}
                >
                  <Footprints className="size-3.5" />
                  Fast travel
                </button>
              </div>
            </>
          )}
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Nearby landmarks</SectionLabel>
            <span className="font-mono text-[9px] text-faint">{nearby.length}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {nearby.length === 0 ? (
              <p className="py-3 text-center text-[10px] text-faint">
                No discovered landmarks within 10 hexes.
              </p>
            ) : (
              nearby.map((poi) => (
                <button
                  key={poi.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border border-line-soft bg-black/15 px-2.5 py-2 text-left transition-colors hover:border-gold/40"
                  onClick={() => setSelectedHex(poi.hex)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[12px] text-parchment-dim">
                      {poi.name}
                    </span>
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-faint">{poi.kind}</span>
                  </span>
                  <span className="font-mono text-[10px] text-gold/70">
                    {poi.hex.q}, {poi.hex.r}
                  </span>
                </button>
              ))
            )}
          </div>
        </Panel>

        <Panel className="p-4">
          <SectionLabel>Chronicle</SectionLabel>
          <div className="mt-2 space-y-1 text-[10px] leading-5 text-faint">
            <div className="flex justify-between gap-3">
              <span>source</span>
              <span className="text-parchment-dim">{world.source}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>size</span>
              <span className="text-parchment-dim">
                {world.width}×{world.height}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>landmarks</span>
              <span className="text-parchment-dim">
                {world.pois.filter((poi) => poi.discovered).length}/{world.pois.length}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>save</span>
              <span className={cn(campaignSaveState === "error" ? "text-[#d9a39d]" : "text-parchment-dim")}>
                {saveLabel}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn px-3! py-1.5!" onClick={() => setQuestOpen(true)}>
              <BookOpen className="size-3.5" />
              Journal
            </button>
            <button type="button" className="btn px-3! py-1.5!" onClick={() => setSheetOpen(true)}>
              <UserRound className="size-3.5" />
              Character
            </button>
            <button type="button" className="btn px-3! py-1.5!" onClick={() => void saveCampaign(campaign)}>
              <Save className="size-3.5" />
              Save now
            </button>
            <button type="button" className="btn px-3! py-1.5!" onClick={() => setScreen("campaign")}>
              <Sparkles className="size-3.5" />
              New chronicle
            </button>
            <button type="button" className="btn btn-ghost px-2! py-1.5!" onClick={() => setScreen("menu")}>
              <Menu className="size-3.5" />
              Menu
            </button>
          </div>
        </Panel>
      </aside>

      {toast ? (
        <div
          className={cn(
            "pointer-events-none fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 border px-4 py-2 text-xs shadow-2xl",
            toast.tone === "warn"
              ? "border-gold/40 bg-ink text-parchment-dim"
              : "border-line bg-ink text-parchment-dim",
          )}
        >
          {toast.tone === "warn" ? (
            <AlertTriangle className="size-3.5 text-gold" />
          ) : (
            <Footprints className="size-3.5 text-gold/70" />
          )}
          {toast.text}
        </div>
      ) : null}

      {sheetOpen ? <CharacterSheet onClose={() => setSheetOpen(false)} /> : null}
      {questOpen ? <QuestJournal onClose={() => setQuestOpen(false)} /> : null}
    </div>
  );
}
