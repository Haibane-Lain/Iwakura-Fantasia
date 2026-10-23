import { getNpcDefinition } from "@iwakura/content";
import type { Hex, LocalBuilding, LocalEncounter } from "@iwakura/contracts";
import {
  advanceTime,
  battleEnemiesForEncounter,
  ensureShop,
  formatClock,
  interactLocal,
  leaveLocalMap,
  localBuildingAt,
  localDistance,
  localExitAt,
  localInteractableAt,
  localIsWalkable,
  localTileInfo,
  moveLocalParty,
  npcAppearance,
  npcAtLocalHex,
  npcsInLocalMap,
  restAtInn,
  startBattle,
  startDialogue,
  timeOfDay,
} from "@iwakura/engine";
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  Clock3,
  Coins,
  DoorOpen,
  Footprints,
  Hourglass,
  LogOut,
  MessageCircle,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  Swords,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CharacterSheet } from "../components/CharacterSheet";
import { DialoguePanel } from "../components/DialoguePanel";
import { LocalCanvas } from "../components/LocalCanvas";
import { Portrait } from "../components/Portrait";
import { QuestJournal } from "../components/QuestJournal";
import { ShopPanel } from "../components/ShopPanel";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

function kindLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function LocalScreen() {
  const campaign = useAppStore((state) => state.campaign);
  const campaignSaveState = useAppStore((state) => state.campaignSaveState);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const setScreen = useAppStore((state) => state.setScreen);

  const [selectedHex, setSelectedHex] = useState<Hex | null>(campaign?.local?.position ?? null);
  const [hoverHex, setHoverHex] = useState<Hex | null>(null);
  const [toast, setToast] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [dialogueNpcId, setDialogueNpcId] = useState<string | null>(null);
  const [dialogueNodeId, setDialogueNodeId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingEncounter, setPendingEncounter] = useState<LocalEncounter | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const local = campaign?.local;
  const presences = useMemo(() => (campaign ? npcsInLocalMap(campaign) : []), [campaign]);
  const markers = useMemo(
    () =>
      presences.map((entry) => ({
        id: entry.npc.id,
        name: entry.npc.name,
        hex: entry.hex,
        palette: entry.npc.palette,
        activity: entry.schedule.activity,
      })),
    [presences],
  );

  if (!campaign || !local) return null;
  const map = local.map;
  const player = campaign.entities.player;
  const selected = selectedHex ?? local.position;
  const selectedTile = localTileInfo(map, selected);
  const selectedNpc = npcAtLocalHex(campaign, selected);
  const selectedBuilding = localBuildingAt(campaign, selected);
  const selectedInteractable = localInteractableAt(campaign, selected);
  const selectedExit = localExitAt(campaign, selected);
  const dialogueNpc = dialogueNpcId ? getNpcDefinition(dialogueNpcId) : undefined;
  const dialogueStart = dialogueNpcId ? startDialogue(campaign, dialogueNpcId) : null;
  const distanceToSelected = localDistance(local.position, selected);

  const notify = (text: string, tone: "info" | "warn" = "info") => setToast({ text, tone });

  const persist = (state: typeof campaign) => {
    void saveCampaign(state);
  };

  const moveTo = (hex: Hex, options: { silent?: boolean } = {}) => {
    if (hex.q === local.position.q && hex.r === local.position.r) {
      setSelectedHex(hex);
      return;
    }
    if (!localIsWalkable(map, hex)) {
      setSelectedHex(hex);
      if (!options.silent) notify("That way is blocked.", "warn");
      return;
    }
    const result = moveLocalParty(campaign, hex);
    if (!result) {
      setSelectedHex(hex);
      if (!options.silent) notify("No path through the crowd or stone.", "warn");
      return;
    }
    setSelectedHex(hex);
    persist(result.state);
    if (result.encounter) {
      setPendingEncounter(result.encounter);
      notify(`${result.encounter.name} — decide whether to fight or avoid.`, "warn");
    }
  };

  const openDialogue = (npcId: string) => {
    const start = startDialogue(campaign, npcId);
    if (!start) return;
    setDialogueNpcId(npcId);
    setDialogueNodeId(start.nodeId);
  };

  const openShop = (id: string) => {
    const next = ensureShop(campaign, id);
    if (next !== campaign) persist(next);
    setShopId(id);
  };

  const examine = (interactableId: string) => {
    const result = interactLocal(campaign, interactableId);
    if (!result) return;
    if (result.state !== campaign) persist(result.state);
    notify(result.message, result.state === campaign ? "warn" : "info");
  };

  const leave = () => {
    const next = leaveLocalMap(campaign);
    persist(next);
  };

  const rest = (building: LocalBuilding) => {
    const result = restAtInn(campaign, building.id);
    if (!result) return;
    if (result.state !== campaign) persist(result.state);
    notify(result.message, result.state === campaign ? "warn" : "info");
  };

  const wait = (hours: number) => {
    persist(advanceTime(campaign, hours * 60));
    notify(`You wait ${hours} hour${hours === 1 ? "" : "s"}. The town shifts around you.`);
  };

  const fight = () => {
    if (!pendingEncounter) return;
    const next = startBattle(campaign, {
      enemyIds: battleEnemiesForEncounter(pendingEncounter.id),
      source: "dungeon",
    });
    if (!next) {
      notify("The enemy is already upon you.", "warn");
      return;
    }
    setPendingEncounter(null);
    persist(next);
  };

  const extra = hoverHex ? localTileInfo(map, hoverHex) : null;

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0 right-[360px]">
        <LocalCanvas
          key={`${map.id}:${local.returnWorldPosition.q},${local.returnWorldPosition.r}`}
          map={map}
          partyHex={local.position}
          npcs={markers}
          onSelect={(hex) => {
            const npc = npcAtLocalHex(campaign, hex);
            setSelectedHex(hex);
            if (npc) {
              if (localDistance(local.position, hex) <= 1) openDialogue(npc.npc.id);
              else notify(`${npc.npc.name} is across the square. Use Talk in the People panel.`);
              return;
            }
            moveTo(hex);
          }}
          onHover={setHoverHex}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,0.52),transparent_20%,transparent_72%,rgba(8,7,6,0.58))]" />

      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-4">
        <Panel className="pointer-events-auto flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            className="btn btn-ghost px-1.5! py-1!"
            onClick={() => setScreen("menu")}
            title="Main menu"
          >
            <LogOut className="size-3.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DoorOpen className="size-3.5 text-gold/70" />
              <span className="truncate font-display text-base tracking-wide text-parchment">{map.name}</span>
              <span className="chip border-gold/30 text-[9px] text-gold/80">{kindLabel(map.kind)}</span>
              <span className="chip border-gold/20 text-[9px] text-gold/60">M3</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {campaign.world.name} · {map.width}×{map.height}
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
              <div className="font-mono text-[11px] text-parchment">{campaign.party.gold} gp</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">purse</div>
            </div>
          </div>
          <div className="h-8 w-px bg-line-soft" />
          <div className="flex items-center gap-2">
            <StatusDot
              tone={campaignSaveState === "error" ? "bad" : campaignSaveState === "saving" ? "warn" : "ok"}
            />
            <div>
              <div className="text-[11px] text-parchment-dim">
                {campaignSaveState === "saving" ? "Saving…" : "Local save"}
              </div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">autosave</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="absolute bottom-4 left-4 right-[368px] flex items-end justify-between gap-4">
        <Panel className="pointer-events-auto min-w-0 max-w-xl px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <Footprints className="size-3.5 text-gold/60" />
            <span>
              Click a hex to walk · scroll to zoom ·{" "}
              {extra ? `${extra.name} under cursor` : "inspect the town"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
            <span>{selectedTile.name}</span>
            <span>
              hex {selected.q}, {selected.r}
            </span>
            <span className="text-parchment-dim">
              {selectedNpc
                ? selectedNpc.npc.name
                : selectedBuilding
                  ? selectedBuilding.name
                  : selectedInteractable
                    ? selectedInteractable.name
                    : selectedExit
                      ? selectedExit.name
                      : selectedTile.name}
            </span>
          </div>
        </Panel>
        <div className="pointer-events-none flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-faint">
          <span className="size-1.5 rounded-full bg-gold/70" />
          {player?.name ?? "party"}
        </div>
      </div>

      <aside className="absolute bottom-4 right-4 top-[76px] flex w-[344px] flex-col gap-3 overflow-y-auto pr-1">
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
                onClick={fight}
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
            <SectionLabel>Location</SectionLabel>
            <span className="chip">{kindLabel(map.kind)}</span>
          </div>
          <div className="mt-2 font-display text-lg text-parchment">{map.name}</div>
          <p className="mt-1 text-[10px] leading-5 text-muted">{map.description}</p>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              className="btn px-2! py-0.5! text-[9px]!"
              onClick={() => wait(1)}
              aria-label="Wait 1 hour"
            >
              <Hourglass className="size-2.5" />
              Wait 1h
            </button>
            <button
              type="button"
              className="btn px-2! py-0.5! text-[9px]!"
              onClick={() => wait(4)}
              aria-label="Wait 4 hours"
            >
              <Hourglass className="size-2.5" />
              Wait 4h
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-line-soft bg-black/10 px-2 py-1.5">
              <div className="text-[8px] uppercase tracking-[0.12em] text-faint">Selected</div>
              <div className="truncate text-[10px] text-parchment-dim">
                {selectedNpc
                  ? selectedNpc.npc.name
                  : selectedBuilding
                    ? selectedBuilding.name
                    : selectedInteractable
                      ? selectedInteractable.name
                      : selectedExit
                        ? selectedExit.name
                        : selectedTile.name}
              </div>
            </div>
            <div className="border border-line-soft bg-black/10 px-2 py-1.5">
              <div className="text-[8px] uppercase tracking-[0.12em] text-faint">Distance</div>
              <div className="font-mono text-[10px] text-parchment-dim">
                {distanceToSelected === 0 ? "here" : `${distanceToSelected} hex`}
              </div>
            </div>
          </div>
          {selectedNpc ? (
            <button
              type="button"
              className="btn mt-2 w-full"
              onClick={() => openDialogue(selectedNpc.npc.id)}
              aria-label={`Talk to ${selectedNpc.npc.name}`}
            >
              <MessageCircle className="size-3.5" />
              Talk to {selectedNpc.npc.name}
            </button>
          ) : selectedBuilding ? (
            <div className="mt-2 flex gap-2">
              {selectedBuilding.shopId ? (
                <button
                  type="button"
                  className="btn flex-1"
                  onClick={() => openShop(selectedBuilding.shopId!)}
                  aria-label={`Trade at ${selectedBuilding.name}`}
                >
                  <ShoppingBag className="size-3.5" />
                  Trade
                </button>
              ) : null}
              {selectedBuilding.kind === "inn" ? (
                <button
                  type="button"
                  className="btn flex-1"
                  onClick={() => rest(selectedBuilding)}
                  aria-label={`Rest at ${selectedBuilding.name}`}
                >
                  <BedDouble className="size-3.5" />
                  Rest · 1 gp
                </button>
              ) : null}
            </div>
          ) : selectedInteractable ? (
            <div className="mt-2 flex gap-2">
              {distanceToSelected > 1 ? (
                <button
                  type="button"
                  className="btn flex-1"
                  onClick={() => moveTo(selectedInteractable.hex)}
                  aria-label={`Walk to ${selectedInteractable.name}`}
                >
                  <Footprints className="size-3.5" />
                  Walk here
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => examine(selectedInteractable.id)}
                aria-label={`Examine ${selectedInteractable.name}`}
              >
                <Search className="size-3.5" />
                Examine
              </button>
            </div>
          ) : selectedExit ? (
            <button
              type="button"
              className="btn btn-primary mt-2 w-full"
              onClick={leave}
              aria-label={`Leave via ${selectedExit.name}`}
            >
              <LogOut className="size-3.5" />
              Leave to the world
            </button>
          ) : null}
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>People here</SectionLabel>
            <span className="font-mono text-[9px] text-faint">{presences.length}</span>
          </div>
          <div className="mt-2 space-y-2">
            {presences.length === 0 ? (
              <p className="py-3 text-center text-[10px] text-faint">No one is about at this hour.</p>
            ) : (
              presences.map((entry) => (
                <div
                  key={entry.npc.id}
                  className="flex items-center gap-2 border border-line-soft bg-black/10 px-2 py-2"
                >
                  <Portrait
                    appearance={npcAppearance(entry.npc)}
                    className="size-10 shrink-0 rounded-sm border border-line"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[12px] text-parchment">{entry.npc.name}</div>
                    <div className="truncate text-[9px] text-faint">{entry.npc.role}</div>
                    <div className="truncate text-[9px] text-gold/60">{entry.schedule.activity}</div>
                  </div>
                  <button
                    type="button"
                    className="btn shrink-0 px-2! py-1! text-[9px]!"
                    onClick={() => openDialogue(entry.npc.id)}
                    aria-label={`Talk to ${entry.npc.name}`}
                  >
                    <MessageCircle className="size-3" />
                    Talk
                  </button>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="p-4">
          <SectionLabel>Buildings</SectionLabel>
          <div className="mt-2 space-y-2">
            {map.buildings.map((building) => (
              <div key={building.id} className="border border-line-soft bg-black/10 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[12px] text-parchment-dim">{building.name}</span>
                  <span className="chip text-[8px]">{kindLabel(building.kind)}</span>
                </div>
                <p className="mt-0.5 text-[9px] leading-4 text-faint">{building.description}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    className="btn px-2! py-0.5! text-[9px]!"
                    onClick={() => {
                      setSelectedHex(building.hex);
                      moveTo(building.hex, { silent: true });
                    }}
                    aria-label={`Walk to ${building.name}`}
                  >
                    <Footprints className="size-2.5" />
                    Door
                  </button>
                  {building.shopId ? (
                    <button
                      type="button"
                      className="btn px-2! py-0.5! text-[9px]!"
                      onClick={() => openShop(building.shopId!)}
                      aria-label={`Trade at ${building.name}`}
                    >
                      <ShoppingBag className="size-2.5" />
                      Trade
                    </button>
                  ) : null}
                  {building.kind === "inn" ? (
                    <button
                      type="button"
                      className="btn px-2! py-0.5! text-[9px]!"
                      onClick={() => rest(building)}
                      aria-label={`Rest at ${building.name}`}
                    >
                      <BedDouble className="size-2.5" />
                      Rest
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <SectionLabel>Points of interest</SectionLabel>
          <div className="mt-2 space-y-2">
            {map.interactables.map((interactable) => {
              const visited = local.visitedInteractables.includes(interactable.id);
              const nearby = localDistance(local.position, interactable.hex) <= 1;
              return (
                <div key={interactable.id} className="border border-line-soft bg-black/10 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[12px] text-parchment-dim">{interactable.name}</span>
                    {visited ? <span className="chip text-[8px]">seen</span> : null}
                  </div>
                  <p className="mt-0.5 text-[9px] leading-4 text-faint">{interactable.description}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {!nearby ? (
                      <button
                        type="button"
                        className="btn px-2! py-0.5! text-[9px]!"
                        onClick={() => moveTo(interactable.hex)}
                        aria-label={`Walk to ${interactable.name}`}
                      >
                        <Footprints className="size-2.5" />
                        Walk
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn px-2! py-0.5! text-[9px]!"
                      onClick={() => examine(interactable.id)}
                      aria-label={`Examine ${interactable.name}`}
                    >
                      <Search className="size-2.5" />
                      Examine
                    </button>
                  </div>
                </div>
              );
            })}
            {map.interactables.length === 0 ? (
              <p className="text-[10px] text-faint">Nothing here but old stone.</p>
            ) : null}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Exits</SectionLabel>
            <span className="font-mono text-[9px] text-faint">{map.exits.length}</span>
          </div>
          <div className="mt-2 space-y-2">
            {map.exits.map((exit) => (
              <button
                key={exit.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 border border-line-soft bg-black/10 px-2.5 py-2 text-left hover:border-gold/40"
                onClick={leave}
                aria-label={`Leave via ${exit.name}`}
              >
                <span>
                  <span className="block font-display text-[12px] text-parchment-dim">{exit.name}</span>
                  <span className="block text-[9px] text-faint">{exit.description}</span>
                </span>
                <LogOut className="size-3.5 shrink-0 text-gold/60" />
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <SectionLabel>Chronicle</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn px-3! py-1.5!" onClick={() => setJournalOpen(true)}>
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
            <button type="button" className="btn btn-ghost px-2! py-1.5!" onClick={() => setScreen("menu")}>
              <LogOut className="size-3.5" />
              Menu
            </button>
          </div>
        </Panel>
      </aside>

      {toast ? (
        <div
          className={cn(
            "pointer-events-none fixed bottom-6 left-1/2 z-30 flex max-w-2xl -translate-x-1/2 items-center gap-2 border px-4 py-2 text-xs shadow-2xl",
            toast.tone === "warn"
              ? "border-gold/40 bg-ink text-parchment-dim"
              : "border-line bg-ink text-parchment-dim",
          )}
        >
          {toast.tone === "warn" ? (
            <AlertTriangle className="size-3.5 shrink-0 text-gold" />
          ) : (
            <Sparkles className="size-3.5 shrink-0 text-gold/70" />
          )}
          {toast.text}
        </div>
      ) : null}

      {dialogueNpc && dialogueStart && dialogueNodeId ? (
        <DialoguePanel
          key={dialogueNpc.id}
          npc={dialogueNpc}
          initialNodeId={dialogueNodeId}
          onClose={() => {
            setDialogueNpcId(null);
            setDialogueNodeId(null);
          }}
          onOpenShop={openShop}
          onToast={notify}
        />
      ) : null}
      {shopId ? <ShopPanel shopId={shopId} onClose={() => setShopId(null)} onToast={notify} /> : null}
      {journalOpen ? <QuestJournal onClose={() => setJournalOpen(false)} /> : null}
      {sheetOpen ? <CharacterSheet onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}
