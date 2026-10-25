import { getAbility } from "@iwakura/content";
import type { Hex } from "@iwakura/contracts";
import {
  battleAttack,
  battleCompanionTurn,
  battleEnemyTurn,
  battleMove,
  battleUnitAt,
  battleUseAbility,
  distance,
  endBattleTurn,
  finishBattle,
  retreatBattle,
} from "@iwakura/engine";
import {
  ArrowLeft,
  Crosshair,
  Dices,
  Footprints,
  Heart,
  Shield,
  Skull,
  Sparkles,
  Swords,
} from "lucide-react";
import { useEffect, useState } from "react";
import { playImpact, playReward } from "../audio";
import { LocalCanvas } from "../components/LocalCanvas";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

export function BattleScreen() {
  const campaign = useAppStore((state) => state.campaign);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const setScreen = useAppStore((state) => state.setScreen);
  const settings = useAppStore((state) => state.settings);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (campaign?.battle?.status === "victory" && settings) {
      playReward(settings.settings.audio.masterVolume, settings.settings.audio.sfxVolume);
    }
  }, [campaign?.battle?.status, settings]);

  const impact = () => {
    if (!settings) return;
    playImpact(settings.settings.audio.masterVolume, settings.settings.audio.sfxVolume);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 240);
  };

  if (!campaign?.battle) return null;
  const battle = campaign.battle;
  const map = battle.map;
  if (!map) return null;
  const player = battle.units.find((unit) => unit.kind === "player");
  const playerEntity = campaign.entities.player;
  const active = battle.units.find((unit) => unit.id === battle.activeUnitId);
  const enemies = battle.units.filter((unit) => unit.team === "enemy" && !unit.defeated);
  const selected = battle.units.find((unit) => unit.id === selectedId) ?? enemies[0];
  const playerTurn = active?.kind === "player" && battle.status === "active";
  const adjacent = Boolean(player && selected && distance(player.position, selected.position) <= 1);
  const movementLeft = player ? player.speed - player.moved : 0;
  const abilities =
    playerEntity?.abilityIds
      .map((id) => getAbility(id))
      .filter((ability): ability is NonNullable<typeof ability> => Boolean(ability)) ?? [];

  const persist = async (state: typeof campaign) => {
    if (state) await saveCampaign(state);
  };

  const move = (hex: Hex) => {
    if (!playerTurn || battle.status !== "active") return;
    const next = battleMove(campaign, hex);
    if (next) void persist(next);
  };

  const attack = () => {
    if (!selected || !playerTurn) return;
    const next = battleAttack(campaign, selected.id);
    if (next) {
      impact();
      void persist(next);
    }
  };

  const castAbility = (abilityId: string) => {
    if (!playerTurn) return;
    const ability = getAbility(abilityId);
    if (!ability) return;
    const target = ability.targeting === "self" ? undefined : selected?.id;
    const next = battleUseAbility(campaign, abilityId, target);
    if (next) {
      impact();
      void persist(next);
    }
  };

  const finish = () => {
    const next = finishBattle(campaign);
    if (next) void persist(next);
  };

  const endTurn = () => {
    const next = endBattleTurn(campaign);
    if (next) void persist(next);
  };

  const markers = [
    ...enemies.map((unit) => ({
      id: unit.id,
      name: unit.name,
      hex: unit.position,
      palette: unit.palette ?? "ember",
      activity: `${unit.hp}/${unit.maxHp} hp`,
      kind: "enemy" as const,
      active: unit.id === battle.activeUnitId,
    })),
    ...battle.units
      .filter((unit) => unit.kind === "companion" && !unit.defeated)
      .map((unit) => ({
        id: unit.id,
        name: unit.name,
        hex: unit.position,
        palette: unit.palette ?? "moss",
        activity: `${unit.hp}/${unit.maxHp} hp`,
        kind: "companion" as const,
        active: unit.id === battle.activeUnitId,
      })),
  ];

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0 right-[380px]">
        <LocalCanvas
          key={battle.id}
          map={map}
          partyHex={player?.position ?? map.entrance}
          npcs={markers}
          hour={campaign.clock.hour}
          partyActive={active?.kind === "player"}
          reduceMotion={settings?.settings.reduceMotion ?? false}
          onSelect={(hex) => {
            const unit = battleUnitAt(battle, hex);
            if (unit && unit.team === "enemy") setSelectedId(unit.id);
            else move(hex);
          }}
          onHover={() => undefined}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,0.6),transparent_20%,transparent_70%,rgba(8,7,6,0.68))]" />
      <div
        className={cn("pointer-events-none absolute inset-0 bg-blood/20 opacity-0", flash && "battle-flash")}
      />

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
          <div>
            <div className="flex items-center gap-2">
              <Swords className="size-3.5 text-gold/70" />
              <span className="font-display text-base tracking-wide text-parchment">Battle</span>
              <span className="chip border-gold/30 text-[9px] text-gold/80">round {battle.round}</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {map.name} · {battle.source}
            </div>
          </div>
        </Panel>
        <Panel className="pointer-events-auto flex items-center gap-4 px-4 py-2">
          <div className="flex items-center gap-2">
            <StatusDot tone={battle.status === "active" ? "ok" : "warn"} />
            <div>
              <div className="text-[11px] text-parchment-dim">
                {battle.status === "active" ? `${active?.name ?? "…"}'s turn` : battle.status}
              </div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">
                initiative {active?.initiative ?? "—"}
              </div>
            </div>
          </div>
          <div className="h-8 w-px bg-line-soft" />
          <div className="flex items-center gap-2">
            <Heart className="size-3.5 text-blood/80" />
            <div>
              <div className="font-mono text-[11px] text-parchment">
                {player?.hp ?? 0}/{player?.maxHp ?? 0}
              </div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-faint">party hp</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="absolute bottom-4 left-4 right-[390px]">
        <Panel className="px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <Footprints className="size-3.5 text-gold/60" />
            <span>
              Click a reachable hex to move · click an enemy to target · {movementLeft} movement left · trees
              and walls grant cover (+2 AC) · high ground grants +1 attack
            </span>
          </div>
        </Panel>
      </div>

      <aside className="absolute bottom-4 right-4 top-[76px] flex w-[362px] flex-col gap-3 overflow-y-auto pr-1">
        {battle.status !== "active" ? (
          <Panel lit className="p-4">
            <SectionLabel>Outcome</SectionLabel>
            <div className="mt-1 flex items-center gap-2">
              {battle.status === "victory" ? (
                <Sparkles className="size-4 text-gold" />
              ) : battle.status === "defeat" ? (
                <Skull className="size-4 text-blood" />
              ) : (
                <Footprints className="size-4 text-muted" />
              )}
              <h2 className="font-display text-2xl capitalize text-parchment">{battle.status}</h2>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              {battle.status === "victory"
                ? `The road is clear. ${battle.rewards.gold} gp is recovered from the fallen.`
                : battle.status === "defeat"
                  ? "The party wakes in the dust, lighter by ten gold and one hard lesson."
                  : "The party withdraws. The enemy holds the ground."}
            </p>
            <button type="button" className="btn btn-primary mt-3 w-full" onClick={finish}>
              <ArrowLeft className="size-3.5" />
              Return to the road
            </button>
          </Panel>
        ) : (
          <>
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Turn order</SectionLabel>
                <span className="chip">
                  {battle.round} · {active?.name ?? "—"}
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {battle.units.map((unit) => (
                  <div
                    key={unit.id}
                    className={cn(
                      "flex items-center gap-2 border px-2 py-1.5 text-[10px]",
                      unit.id === active?.id
                        ? "border-gold/40 bg-gold/[0.05] text-parchment"
                        : unit.defeated
                          ? "border-line-soft text-faint line-through"
                          : "border-line-soft text-parchment-dim",
                    )}
                  >
                    <span className="font-mono text-[9px] text-faint">{unit.initiative}</span>
                    <span className="min-w-0 flex-1 truncate">{unit.name}</span>
                    <span className="font-mono text-[9px]">
                      {unit.hp}/{unit.maxHp}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {active?.kind === "companion" ? (
              <Panel className="border-moss/35 p-4">
                <SectionLabel>Companion turn</SectionLabel>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {active.name} is acting on their own. Resolve the turn to continue.
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-3 w-full"
                  onClick={() => {
                    const next = battleCompanionTurn(campaign);
                    if (next) void persist(next);
                  }}
                >
                  <Swords className="size-3.5" />
                  Resolve {active.name}
                </button>
              </Panel>
            ) : active?.team === "enemy" ? (
              <Panel className="border-gold/30 p-4">
                <SectionLabel>Enemy turn</SectionLabel>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {active.name} is acting. Resolve the turn to continue the round.
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-3 w-full"
                  onClick={() => {
                    const next = battleEnemyTurn(campaign);
                    if (next) void persist(next);
                  }}
                >
                  <Dices className="size-3.5" />
                  Resolve {active.name}
                </button>
              </Panel>
            ) : (
              <Panel className="p-4">
                <div className="flex items-center justify-between">
                  <SectionLabel>Your turn</SectionLabel>
                  <span className="chip">
                    <Heart className="size-3 text-blood/80" />
                    {player?.hp}/{player?.maxHp} · AC {player?.ac}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {enemies.map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      className={cn(
                        "chip",
                        selected?.id === unit.id ? "border-gold/60 text-gold-bright" : "hover:border-line",
                      )}
                      onClick={() => setSelectedId(unit.id)}
                    >
                      <Crosshair className="size-2.5" />
                      {unit.name} · {unit.hp} hp
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={attack}
                    disabled={!selected || !adjacent || Boolean(player?.actionUsed)}
                  >
                    <Swords className="size-3.5" />
                    Attack
                  </button>
                  <button type="button" className="btn" onClick={endTurn}>
                    <Footprints className="size-3.5" />
                    End turn
                  </button>
                </div>
                <div className="mt-3">
                  <div className="kicker">Abilities</div>
                  <div className="mt-1.5 grid gap-1.5">
                    {abilities.map((ability) => {
                      const cost = ability.cost;
                      const focus = playerEntity?.focus.current ?? 0;
                      const disabled = Boolean(player?.actionUsed) || focus < cost;
                      return (
                        <button
                          key={ability.id}
                          type="button"
                          className="flex items-center justify-between gap-2 border border-line-soft px-2 py-1.5 text-left text-[10px] text-parchment-dim hover:border-gold/40 disabled:text-faint"
                          disabled={disabled}
                          onClick={() => castAbility(ability.id)}
                          title={ability.description}
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="size-3 text-gold/60" />
                            {ability.name}
                          </span>
                          <span className="font-mono text-[9px]">{cost} focus</span>
                        </button>
                      );
                    })}
                    {abilities.length === 0 ? <p className="text-[10px] text-faint">No abilities.</p> : null}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-faint">
                    Focus {playerEntity?.focus.current ?? 0}/{playerEntity?.focus.max ?? 0}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost px-2! py-0.5! text-[9px]!"
                    onClick={() => {
                      const next = retreatBattle(campaign);
                      if (next) void persist(next);
                    }}
                  >
                    <Footprints className="size-3" />
                    Retreat
                  </button>
                </div>
              </Panel>
            )}

            <Panel className="p-4">
              <SectionLabel>Combat log</SectionLabel>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[10px] leading-4 text-muted">
                {battle.log.slice(-18).map((line) => (
                  <div
                    key={`${line.slice(0, 24)}-${line.length}-${battle.round}`}
                    className="border-b border-line-soft/50 py-1 last:border-0"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}

        {battle.status === "active" ? (
          <Panel className="p-3">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-faint">
              <Shield className="size-3 text-gold/60" />
              {player?.conditions.length ? player.conditions.join(", ") : "no conditions"}
            </div>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}
