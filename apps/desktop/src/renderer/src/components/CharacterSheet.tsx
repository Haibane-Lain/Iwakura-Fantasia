import { getAbility, getAncestry, getBackground, getClass, getItem, getSkill } from "@iwakura/content";
import type { CharacterAppearance, Entity, GameState } from "@iwakura/contracts";
import {
  abilityModifier,
  allSkillModifiers,
  companionApproval,
  companionBanter,
  dismissCompanion,
  type EquipmentSlot,
  equipItem,
  formatModifier,
  proficiencyBonus,
  rollSkillCheck,
  saveModifier,
  unequipItem,
} from "@iwakura/engine";
import { Backpack, Check, Dices, ListChecks, Sparkles, Swords, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { Portrait } from "./Portrait";
import { cn, Panel, StatusDot } from "./ui";

type Tab = "overview" | "inventory" | "skills";

const ATTR_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ATTR_LABELS = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
} as const;

function appearanceFor(entity: Entity): CharacterAppearance {
  return (
    entity.appearance ?? {
      palette: "verdant",
      sigil: "hex",
      seed: `${entity.name}:${entity.id}`,
    }
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-line-soft bg-black/10 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-parchment">{value}</div>
      {hint ? <div className="text-[9px] text-faint">{hint}</div> : null}
    </div>
  );
}

function ItemLine({
  itemId,
  quantity,
  equipped,
  onEquip,
  onUnequip,
}: {
  itemId: string;
  quantity?: number;
  equipped?: EquipmentSlot;
  onEquip?: () => void;
  onUnequip?: () => void;
}) {
  const item = getItem(itemId);
  return (
    <div className="flex items-start justify-between gap-3 border border-line-soft bg-black/10 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm text-parchment">{item?.name ?? itemId}</span>
          {equipped ? (
            <span className="chip border-gold/40 text-[9px] text-gold-bright">equipped</span>
          ) : null}
          {quantity && quantity > 1 ? <span className="chip text-[9px]">×{quantity}</span> : null}
        </div>
        <div className="mt-0.5 text-[10px] leading-4 text-muted">{item?.description ?? "Unknown item"}</div>
        {item?.kind === "weapon" ? (
          <div className="mt-1 font-mono text-[9px] text-faint">
            {String(item.stats.damage ?? "—")} {String(item.stats.damageType ?? "")}
          </div>
        ) : item?.kind === "armor" ? (
          <div className="mt-1 font-mono text-[9px] text-faint">AC {String(item.stats.ac ?? "—")}</div>
        ) : null}
      </div>
      <div className="shrink-0">
        {equipped && onUnequip ? (
          <button type="button" className="btn px-2! py-1! text-[9px]!" onClick={onUnequip}>
            Unequip
          </button>
        ) : onEquip ? (
          <button type="button" className="btn px-2! py-1! text-[9px]!" onClick={onEquip}>
            Equip
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CharacterSheet({ onClose }: { onClose: () => void }) {
  const campaign = useAppStore((state) => state.campaign);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const campaignSaveState = useAppStore((state) => state.campaignSaveState);
  const [tab, setTab] = useState<Tab>("overview");
  const [lastRoll, setLastRoll] = useState<{
    name: string;
    die: number;
    modifier: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!campaign) return null;
  const entity = campaign.entities.player;
  if (!entity) return null;

  const ancestry = entity.ancestryId ? getAncestry(entity.ancestryId) : undefined;
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const background = entity.backgroundId ? getBackground(entity.backgroundId) : undefined;
  const appearance = appearanceFor(entity);
  const initiative = abilityModifier(entity.attributes.dex);
  const skills = allSkillModifiers(entity);
  const companions = campaign.party.memberIds
    .filter((id) => id !== "player")
    .map((id) => campaign.entities[id])
    .filter((entry): entry is Entity => Boolean(entry));

  const update = async (state: GameState) => {
    await saveCampaign(state);
  };

  const equip = (itemId: string) => {
    const slot = getItem(itemId)?.kind;
    if (!slot) return;
    void update(equipItem(campaign, itemId));
  };

  const roll = (skillId: string) => {
    const { state, result } = rollSkillCheck(campaign, skillId);
    const skill = getSkill(skillId);
    setLastRoll({
      name: skill?.name ?? skillId,
      die: result.die,
      modifier: result.modifier,
      total: result.total,
    });
    void update(state);
  };

  const dismiss = (npcId: string) => {
    const result = dismissCompanion(campaign, npcId);
    if (result.state !== campaign) void update(result.state);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close character sheet"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <Panel lit className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-start gap-4 border-b border-line-soft px-5 py-4">
          <Portrait appearance={appearance} className="size-20 shrink-0 rounded-sm border border-line" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-2xl text-parchment">{entity.name}</h2>
              <span className="chip border-gold/30 text-[9px] text-gold/80">level {entity.level}</span>
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-faint">
              {ancestry?.name ?? "Unknown ancestry"} · {characterClass?.name ?? "Unknown class"} ·{" "}
              {background?.name ?? "Unknown background"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip">
                <StatusDot tone={campaignSaveState === "saving" ? "warn" : "ok"} />
                {campaignSaveState === "saving" ? "saving" : "saved"}
              </span>
              <span className="chip">
                HP {entity.hp.current}/{entity.hp.max}
              </span>
              <span className="chip">AC {entity.ac}</span>
              <span className="chip">
                {characterClass?.focusName ?? "Focus"} {entity.focus.current}/{entity.focus.max}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost px-2! py-1!" onClick={onClose} title="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-line-soft px-4 py-2">
          {(
            [
              ["overview", "Overview", UserRound],
              ["inventory", "Inventory", Backpack],
              ["skills", "Skills", ListChecks],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]",
                tab === id
                  ? "border border-gold/40 text-gold-bright"
                  : "border border-transparent text-muted hover:text-parchment",
              )}
              onClick={() => setTab(id)}
            >
              <Icon className="size-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === "overview" ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
              <div>
                <div className="grid grid-cols-3 gap-2">
                  {ATTR_KEYS.map((key) => (
                    <div key={key} className="border border-line-soft bg-black/10 px-2.5 py-2 text-center">
                      <div className="text-[9px] uppercase tracking-[0.1em] text-faint">
                        {ATTR_LABELS[key]}
                      </div>
                      <div className="mt-0.5 font-mono text-lg text-parchment">{entity.attributes[key]}</div>
                      <div className="text-[10px] text-gold/75">
                        {formatModifier(abilityModifier(entity.attributes[key]))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Stat label="Initiative" value={formatModifier(initiative)} />
                  <Stat label="Proficiency" value={`+${proficiencyBonus(entity.level)}`} />
                  <Stat label="Speed" value={`${entity.speed} hex`} />
                  <Stat label="HP" value={`${entity.hp.current} / ${entity.hp.max}`} />
                  <Stat
                    label="AC"
                    value={entity.ac}
                    hint={entity.equipment.armor ? getItem(entity.equipment.armor)?.name : "unarmored"}
                  />
                  <Stat
                    label={characterClass?.focusName ?? "Focus"}
                    value={`${entity.focus.current} / ${entity.focus.max}`}
                  />
                </div>

                <div className="mt-4">
                  <div className="kicker">Saving throws</div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {ATTR_KEYS.map((key) => (
                      <div
                        key={key}
                        className="flex items-center justify-between border border-line-soft px-2 py-1 text-[10px]"
                      >
                        <span className="text-faint">{ATTR_LABELS[key].slice(0, 3)}</span>
                        <span className="font-mono text-parchment-dim">
                          {formatModifier(saveModifier(entity, key))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="kicker">Traits</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ancestry?.traits.map((trait) => (
                      <span key={trait.id} className="chip text-[9px]" title={trait.description}>
                        {trait.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="kicker">Companions</div>
                  <div className="mt-2 space-y-2">
                    {companions.length === 0 ? (
                      <p className="text-[10px] text-faint">No one travels with you yet.</p>
                    ) : (
                      companions.map((companion) => {
                        const approval = companionApproval(campaign, companion.id);
                        const banter = companionBanter(campaign, companion.id);
                        return (
                          <div key={companion.id} className="border border-line-soft bg-black/10 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Portrait
                                  appearance={appearanceFor(companion)}
                                  className="size-9 rounded-sm border border-line"
                                />
                                <div>
                                  <div className="font-display text-sm text-parchment">{companion.name}</div>
                                  <div className="text-[9px] text-faint">
                                    approval {approval} · {companion.hp.current}/{companion.hp.max} hp
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn px-2! py-0.5! text-[9px]!"
                                onClick={() => dismiss(companion.id)}
                              >
                                Part ways
                              </button>
                            </div>
                            {banter.length > 0 ? (
                              <p className="mt-1 text-[10px] italic leading-4 text-muted">
                                “{banter[banter.length - 1]}”
                              </p>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="kicker">Abilities</div>
                <div className="mt-2 space-y-2">
                  {entity.abilityIds.map((id) => {
                    const ability = getAbility(id);
                    return (
                      <div key={id} className="border border-line-soft bg-black/10 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-sm text-parchment">{ability?.name ?? id}</span>
                          <span className="chip text-[9px]">
                            {ability?.cost ?? 0} {characterClass?.focusName ?? "focus"}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted">{ability?.description}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 border border-line-soft bg-black/10 px-3 py-2 text-[10px] leading-5 text-muted">
                  <div className="flex items-center gap-2 text-parchment-dim">
                    <Sparkles className="size-3 text-gold/70" />
                    Background hook
                  </div>
                  {background?.hook}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "inventory" ? (
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="kicker">Equipped</div>
                <div className="mt-2 space-y-2">
                  {entity.equipment.mainHand ? (
                    <ItemLine
                      itemId={entity.equipment.mainHand}
                      equipped="mainHand"
                      onUnequip={() => void update(unequipItem(campaign, "mainHand"))}
                    />
                  ) : null}
                  {entity.equipment.armor ? (
                    <ItemLine
                      itemId={entity.equipment.armor}
                      equipped="armor"
                      onUnequip={() => void update(unequipItem(campaign, "armor"))}
                    />
                  ) : null}
                  {entity.equipment.offHand ? (
                    <ItemLine
                      itemId={entity.equipment.offHand}
                      equipped="offHand"
                      onUnequip={() => void update(unequipItem(campaign, "offHand"))}
                    />
                  ) : null}
                  {!entity.equipment.mainHand && !entity.equipment.armor && !entity.equipment.offHand ? (
                    <p className="text-[10px] text-faint">Nothing equipped.</p>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Stat label="Gold" value={`${campaign.party.gold} gp`} />
                  <Stat label="Carrying" value={entity.inventory.length} hint="items" />
                </div>
              </div>

              <div>
                <div className="kicker">Pack</div>
                <div className="mt-2 space-y-2">
                  {entity.inventory.map((entry) => {
                    const item = getItem(entry.itemId);
                    const slot: EquipmentSlot | null =
                      item?.kind === "weapon"
                        ? "mainHand"
                        : item?.kind === "armor"
                          ? "armor"
                          : item?.kind === "shield"
                            ? "offHand"
                            : null;
                    const equipped =
                      slot === "mainHand"
                        ? entity.equipment.mainHand === entry.itemId
                        : slot === "armor"
                          ? entity.equipment.armor === entry.itemId
                          : slot === "offHand"
                            ? entity.equipment.offHand === entry.itemId
                            : false;
                    return (
                      <ItemLine
                        key={entry.itemId}
                        itemId={entry.itemId}
                        quantity={entry.quantity}
                        equipped={equipped && slot ? slot : undefined}
                        onEquip={slot && !equipped ? () => equip(entry.itemId) : undefined}
                        onUnequip={
                          equipped && slot ? () => void update(unequipItem(campaign, slot)) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "skills" ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] leading-5 text-faint">
                  Roll d20 + modifier. Proficient skills add +{proficiencyBonus(entity.level)}.
                </div>
                {lastRoll ? (
                  <div className="flex items-center gap-2 border border-gold/30 bg-gold/[0.05] px-3 py-1.5">
                    <Dices className="size-3.5 text-gold" />
                    <span className="text-[11px] text-parchment-dim">
                      {lastRoll.name}: d20 {lastRoll.die} {formatModifier(lastRoll.modifier)} ={" "}
                      <span className="font-mono text-gold-bright">{lastRoll.total}</span>
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between gap-3 border border-line-soft bg-black/10 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {skill.proficient ? (
                        <Check className="size-3 shrink-0 text-moss" />
                      ) : (
                        <span className="size-3 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "truncate text-[11px]",
                            skill.proficient ? "text-parchment" : "text-parchment-dim",
                          )}
                        >
                          {skill.name}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.1em] text-faint">
                          {ATTR_LABELS[skill.attribute]}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-gold/80">
                        {formatModifier(skill.modifier)}
                      </span>
                      <button
                        type="button"
                        className="btn px-2! py-1! text-[9px]!"
                        onClick={() => roll(skill.id)}
                      >
                        <Dices className="size-3" />
                        Roll
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-line-soft px-5 py-3 text-[9px] uppercase tracking-[0.14em] text-faint">
          <span className="flex items-center gap-2">
            <Swords className="size-3 text-gold/50" />
            {characterClass?.name ?? "Adventurer"} · {entity.skillIds.length} proficient skills ·{" "}
            {entity.abilityIds.length} abilities
          </span>
        </div>
      </Panel>
    </div>
  );
}
