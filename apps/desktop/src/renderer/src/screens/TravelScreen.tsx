import type { Hex, TravelEnemyGroup } from "@iwakura/contracts";
import {
  beginTravelBattle,
  crossTravelEdge,
  enterTravelGate,
  formatClock,
  localTileInfo,
  neighbor,
  syncTravelPosition,
  TRAVEL_DIRECTION_NAMES,
  timeOfDay,
  travelEdgeAt,
  travelEnemyNear,
  travelGateAt,
  travelNearbyGate,
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
  Save,
  Swords,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CharacterSheet } from "../components/CharacterSheet";
import { QuestJournal } from "../components/QuestJournal";
import { TravelCanvas } from "../components/TravelCanvas";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

export function TravelScreen() {
  const campaign = useAppStore((state) => state.campaign);
  const saveState = useAppStore((state) => state.campaignSaveState);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const setCampaign = useAppStore((state) => state.setCampaign);
  const setScreen = useAppStore((state) => state.setScreen);
  const setWorldMode = useAppStore((state) => state.setWorldMode);
  const settings = useAppStore((state) => state.settings);

  const latest = useRef(campaign);
  latest.current = campaign;
  const busy = useRef(false);
  const savePaused = useRef(false);
  const travelWorldKey = campaign?.travel
    ? `${campaign.travel.worldHex.q},${campaign.travel.worldHex.r}`
    : "";
  const [hoverHex, setHoverHex] = useState<Hex | null>(null);
  const [selectedHex, setSelectedHex] = useState<Hex | null>(campaign?.travel?.position ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "warn" } | null>(null);
  const [transition, setTransition] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!travelWorldKey) return;
    const current = latest.current;
    if (!current?.travel) return;
    setSelectedHex(current.travel.position);
    setHoverHex(null);
    const enemy = travelEnemyNear(current, current.travel.position);
    if (!enemy) return;
    const battle = beginTravelBattle(current, enemy.id);
    if (!battle) return;
    savePaused.current = true;
    setCampaign(battle);
    void saveCampaign(battle);
  }, [travelWorldKey, saveCampaign, setCampaign]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!savePaused.current && latest.current?.travel) void saveCampaign(latest.current);
    }, 8000);
    return () => clearInterval(timer);
  }, [saveCampaign]);

  const travel = campaign?.travel;
  const player = campaign?.entities.player;
  const companions = useMemo(() => {
    if (!campaign) return [];
    return campaign.party.memberIds
      .filter((id) => id !== "player")
      .map((id) => campaign.entities[id])
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity?.companion))
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        palette: entity.appearance?.palette ?? "moss",
        seed: entity.appearance?.seed,
        ancestryId: entity.ancestryId,
        classId: entity.classId,
        sigil: entity.appearance?.sigil,
        mainHand: entity.equipment.mainHand,
        offHand: entity.equipment.offHand,
      }));
  }, [campaign]);
  const partyAppearance = player
    ? {
        id: player.id,
        name: player.name,
        palette: player.appearance?.palette ?? "gold",
        seed: player.appearance?.seed,
        ancestryId: player.ancestryId,
        classId: player.classId,
        sigil: player.appearance?.sigil,
        mainHand: player.equipment.mainHand,
        offHand: player.equipment.offHand,
      }
    : undefined;

  if (!campaign || !travel) return null;
  const map = travel.map;
  const shownHex = hoverHex ?? selectedHex ?? travel.position;
  const shown = localTileInfo(map, shownHex);
  const poi = campaign.world.pois.find(
    (entry) => entry.hex.q === travel.worldHex.q && entry.hex.r === travel.worldHex.r,
  );
  const nearbyEnemies = travel.enemies.filter((group) => {
    const dx = group.hex.q - travel.position.q;
    const dy = group.hex.r - travel.position.r;
    return Math.abs(dx) + Math.abs(dy) <= 12;
  });
  const gate = travelNearbyGate(campaign, travel.position);
  const edge = travelEdgeAt(campaign, travel.position);
  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Autosave active";

  const persist = (state: typeof campaign) => {
    void saveCampaign(state);
  };

  const handleAnchor = (hex: Hex) => {
    const current = latest.current;
    if (!current?.travel || busy.current) return;
    const synced = syncTravelPosition(current, hex);
    setCampaign(synced);
    setSelectedHex(hex);

    const crossed = travelEdgeAt(synced, hex);
    if (crossed?.direction !== undefined) {
      const result = crossTravelEdge(synced, crossed.direction);
      if (result) {
        busy.current = true;
        savePaused.current = true;
        setTransition(result.message);
        setCampaign(result.state);
        persist(result.state);
        window.setTimeout(() => {
          busy.current = false;
          savePaused.current = false;
          setTransition(null);
        }, 700);
        return;
      }
    }

    const reachedGate = travelGateAt(synced, hex);
    if (reachedGate) {
      const entered = enterTravelGate(synced, reachedGate.poiId);
      if (entered) {
        busy.current = true;
        savePaused.current = true;
        setCampaign(entered);
        persist(entered);
        setWorldMode("travel");
        return;
      }
    }

    const enemy = travelEnemyNear(synced, hex);
    if (enemy) {
      const battle = beginTravelBattle(synced, enemy.id);
      if (battle) {
        busy.current = true;
        savePaused.current = true;
        setCampaign(battle);
        persist(battle);
        return;
      }
    }
  };

  const handleFacing = (facing: number) => {
    const current = latest.current;
    if (!current?.travel) return;
    if (current.travel.facing === facing) return;
    setCampaign(syncTravelPosition(current, current.travel.position, facing));
  };

  const enterNearbyGate = () => {
    if (!gate) return;
    const entered = enterTravelGate(campaign, gate.poiId);
    if (!entered) return;
    savePaused.current = true;
    setCampaign(entered);
    persist(entered);
    setWorldMode("travel");
  };

  const atlas = () => {
    void saveCampaign(campaign);
    setWorldMode("atlas");
    setScreen("world");
  };

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0 right-[360px]">
        <TravelCanvas
          key={`${travel.worldHex.q},${travel.worldHex.r}:${travel.entryEdge ?? "start"}:${map.id}`}
          map={map}
          partyHex={travel.position}
          partyName={player?.name ?? "The party"}
          companions={companions}
          enemies={travel.enemies}
          paused={sheetOpen || questOpen}
          hour={campaign.clock.hour}
          reduceMotion={settings?.settings.reduceMotion ?? false}
          weatherSetting={settings?.settings.weather ?? "auto"}
          graphicsQuality={settings?.settings.graphicsQuality ?? "balanced"}
          weatherSeed={campaign.world.seed}
          partyAppearance={partyAppearance}
          partyFacing={travel.facing}
          onAnchor={handleAnchor}
          onHover={setHoverHex}
          onFacing={handleFacing}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 right-[360px] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(8,7,6,0.48))]" />

      {transition ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-void/70 backdrop-blur-[2px]">
          <div className="border border-gold/40 bg-ink px-6 py-4 text-center">
            <Compass className="mx-auto size-5 text-gold" />
            <p className="mt-2 font-display text-lg text-parchment">{transition}</p>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-4">
        <Panel className="pointer-events-auto flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            className="btn btn-ghost px-1.5! py-1!"
            onClick={() => {
              void saveCampaign(campaign);
              setScreen("menu");
            }}
            title="Main menu"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Footprints className="size-3.5 text-gold/70" />
              <span className="truncate font-display text-base tracking-wide text-parchment">Travel Map</span>
              <span className="chip border-gold/30 text-[9px] text-gold/80">M8</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {map.name} · world hex {travel.worldHex.q}, {travel.worldHex.r}
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
          </div>
        </Panel>

        <Panel className="pointer-events-auto flex items-center gap-4 px-3 py-2">
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
              <div className="font-mono text-[11px] text-parchment">{campaign.party.gold} gp</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">purse</div>
            </div>
          </div>
          <div className="h-8 w-px bg-line-soft" />
          <div className="flex items-center gap-2">
            <StatusDot tone={saveState === "error" ? "bad" : saveState === "saving" ? "warn" : "ok"} />
            <div>
              <div className="text-[11px] text-parchment-dim">{saveLabel}</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">field save</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="absolute bottom-4 left-4 right-[368px] flex items-end justify-between gap-4">
        <Panel className="pointer-events-auto min-w-0 max-w-2xl px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <Compass className="size-3.5 text-gold/60" />
            <span>
              <strong className="text-parchment-dim">WASD</strong> move · <strong>Shift</strong> run · walk
              through gates and road edges · scroll to zoom
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
            <span>{shown.name}</span>
            <span>
              hex {shownHex.q}, {shownHex.r}
            </span>
            {poi ? <span className="text-parchment-dim">{poi.name}</span> : null}
            <span className={cn(nearbyEnemies.length > 0 ? "text-[#d9a39d]" : "text-faint")}>
              {nearbyEnemies.length} threats near
            </span>
          </div>
        </Panel>
        <div className="pointer-events-none flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-faint">
          <span className="size-1.5 rounded-full bg-gold/70" />
          party
        </div>
      </div>

      <aside className="absolute bottom-4 right-4 top-[76px] flex w-[344px] flex-col gap-3 overflow-y-auto pr-1">
        <Panel className="border-gold/25 p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Field map</SectionLabel>
            <span className="chip">{shown.name}</span>
          </div>
          <p className="mt-2 text-[10px] leading-5 text-muted">
            The world hex unfolds around you. Roads, water, and settlement gates continue across the boundary.
            Enter the next hex by walking through a marked road edge.
          </p>
          {gate ? (
            <button type="button" className="btn btn-primary mt-3 w-full" onClick={enterNearbyGate}>
              <DoorOpen className="size-3.5" />
              Enter {gate.name}
            </button>
          ) : null}
          {edge ? (
            <div className="mt-3 border border-moss/30 bg-moss/[0.05] px-3 py-2 text-[10px] text-parchment-dim">
              On the {edge.name} road edge. Keep walking to cross.
            </div>
          ) : null}
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Road edges</SectionLabel>
            <span className="font-mono text-[9px] text-faint">{map.exits.length}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {map.exits.length === 0 ? (
              <p className="text-[10px] text-faint">No open land routes from this hex.</p>
            ) : (
              map.exits.map((exit) => {
                const target = neighbor(travel.worldHex, exit.direction ?? 0);
                return (
                  <div
                    key={exit.id}
                    className="flex items-center justify-between gap-2 border border-line-soft bg-black/10 px-2.5 py-1.5"
                  >
                    <span className="text-[10px] text-parchment-dim">{exit.name}</span>
                    <span className="font-mono text-[9px] text-faint">
                      {TRAVEL_DIRECTION_NAMES[exit.direction ?? 0]} · {target.q},{target.r}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        {nearbyEnemies.length > 0 ? (
          <Panel className="border-[#8e3d36]/50 p-4">
            <div className="flex items-center gap-2">
              <Swords className="size-4 text-[#d9a39d]" />
              <SectionLabel>Threats</SectionLabel>
            </div>
            <div className="mt-2 space-y-1.5">
              {nearbyEnemies.map((group: TravelEnemyGroup) => (
                <div key={group.id} className="border border-line-soft bg-black/10 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-parchment-dim">{group.name}</span>
                    <span className="font-mono text-[9px] text-faint">{group.enemyIds.length} foes</span>
                  </div>
                  <p className="mt-0.5 text-[9px] leading-4 text-faint">{group.description}</p>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="p-4">
          <SectionLabel>Chronicle</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn px-3! py-1.5!" onClick={atlas}>
              <MapIcon className="size-3.5" />
              Atlas
            </button>
            <button type="button" className="btn px-3! py-1.5!" onClick={() => setQuestOpen(true)}>
              <BookOpen className="size-3.5" />
              Journal
            </button>
            <button type="button" className="btn px-3! py-1.5!" onClick={() => setSheetOpen(true)}>
              <UserRound className="size-3.5" />
              Character
            </button>
            <button type="button" className="btn px-3! py-1.5!" onClick={() => persist(campaign)}>
              <Save className="size-3.5" />
              Save
            </button>
          </div>
          <div className="mt-3 border-t border-line-soft pt-2 text-[9px] leading-5 text-faint">
            Combat begins automatically when a visible threat closes in. The map becomes the battle field;
            victory returns you to the road.
          </div>
        </Panel>
      </aside>

      {toast ? (
        <div
          className={cn(
            "pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 border px-4 py-2 text-xs shadow-2xl",
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
