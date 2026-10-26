import {
  FEATS,
  getAbility,
  getAncestry,
  getBackground,
  getClass,
  getFeat,
  getHeritage,
  getItem,
  getSkill,
  getSubclass,
  getTalentTree,
  LANGUAGES,
  TOOLS,
} from "@iwakura/content";
import type {
  AttributeKey,
  CharacterAppearance,
  Entity,
  FeatureEffect,
  GameState,
  TalentNode,
} from "@iwakura/contracts";
import {
  type AdvantageMode,
  abilityModifier,
  allSkillModifiers,
  applyLevelUp,
  attackBonus,
  availableTalentNodes,
  companionApproval,
  companionBanter,
  dismissCompanion,
  type EquipmentSlot,
  equipItem,
  formatModifier,
  initiativeBonus,
  MAX_LEVEL,
  milestoneProgress,
  passiveScore,
  proficiencyBonus,
  refundTalentPoints,
  rollSkillCheck,
  saveModifier,
  spendTalentPoint,
  unequipItem,
} from "@iwakura/engine";
import {
  Award,
  Backpack,
  Check,
  Dices,
  GitBranch,
  Heart,
  ListChecks,
  Shield,
  Sparkles,
  Swords,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { Portrait } from "./Portrait";
import { cn, Panel, StatusDot } from "./ui";

type Tab = "overview" | "path" | "talents" | "inventory" | "skills";

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

function effectText(effect: FeatureEffect): string {
  switch (effect.kind) {
    case "skill_proficiency":
      return `${getSkill(effect.skillId)?.name ?? effect.skillId} proficiency`;
    case "expertise":
      return `${getSkill(effect.skillId)?.name ?? effect.skillId} expertise`;
    case "tool_proficiency":
      return `${TOOLS.find((entry) => entry.id === effect.toolId)?.name ?? effect.toolId} proficiency`;
    case "language":
      return `${LANGUAGES.find((entry) => entry.id === effect.languageId)?.name ?? effect.languageId} language`;
    case "resistance":
      return `${effect.damageType} resistance`;
    case "grant_ability":
      return getAbility(effect.abilityId)?.name ?? effect.abilityId;
    case "stat": {
      const target =
        effect.stat === "skill"
          ? effect.skillId
            ? getSkill(effect.skillId)?.name
            : "all skills"
          : effect.stat === "save"
            ? effect.attribute
              ? `${ATTR_LABELS[effect.attribute]} saves`
              : "all saves"
            : effect.stat.replaceAll("_", " ");
      return `${formatModifier(effect.value)} ${target}`;
    }
    default:
      return "";
  }
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

function TalentCard({
  node,
  known,
  available,
  points,
  onSpend,
}: {
  node: TalentNode;
  known: boolean;
  available: boolean;
  points: number;
  onSpend: () => void;
}) {
  const canBuy = available && points >= node.cost;
  return (
    <div
      className={cn(
        "border px-3 py-2",
        known
          ? "border-moss/40 bg-moss/[0.05]"
          : available
            ? "border-gold/40 bg-gold/[0.04]"
            : "border-line-soft bg-black/10 opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm text-parchment">{node.name}</span>
        <span className={cn("chip text-[9px]", known && "border-moss/40 text-moss")}>
          {known ? "known" : `${node.cost} pt${node.cost === 1 ? "" : "s"}`}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted">{node.description}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {node.effects.map((effect) => (
          <span key={`${node.id}-${JSON.stringify(effect)}`} className="chip text-[8px]">
            {effectText(effect)}
          </span>
        ))}
        {node.abilityIds.map((id) => (
          <span key={id} className="chip text-[8px]">
            {getAbility(id)?.name ?? id}
          </span>
        ))}
      </div>
      {!known && available ? (
        <button
          type="button"
          className="btn mt-2 w-full px-2! py-1! text-[9px]!"
          onClick={onSpend}
          disabled={!canBuy}
        >
          Learn · {node.cost} point{node.cost === 1 ? "" : "s"}
        </button>
      ) : null}
      {!known && !available ? (
        <div className="mt-1 text-[9px] text-faint">
          Requires level {node.level}
          {node.prerequisites.length ? " and the preceding node" : ""}.
        </div>
      ) : null}
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
    dc?: number;
    success?: boolean;
    mode: AdvantageMode;
  } | null>(null);
  const [dc, setDc] = useState(15);
  const [checkMode, setCheckMode] = useState<AdvantageMode>("normal");
  const [subclassChoice, setSubclassChoice] = useState("");
  const [featChoice, setFeatChoice] = useState("");
  const [asiChoice, setAsiChoice] = useState<AttributeKey | "">("");

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
  const heritage = getHeritage(entity.ancestryId ?? "", entity.heritageId);
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const background = entity.backgroundId ? getBackground(entity.backgroundId) : undefined;
  const subclass = entity.progression.subclassId ? getSubclass(entity.progression.subclassId) : undefined;
  const specialty = characterClass?.specialties.find((entry) => entry.id === entity.progression.specialtyId);
  const talentTree = characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined;
  const appearance = appearanceFor(entity);
  const initiative = initiativeBonus(entity);
  const skills = allSkillModifiers(entity);
  const milestone = milestoneProgress(entity);
  const availableNodes = availableTalentNodes(entity);
  const availableNodeIds = new Set(availableNodes.map((node) => node.id));
  const spentNodes = new Set(entity.progression.spentTalentNodeIds);
  const featNames = entity.progression.featIds.map((id) => getFeat(id)?.name ?? id);
  const classFeatures =
    characterClass?.levelFeatures.filter((feature) => feature.level <= entity.level) ?? [];
  const nextFeatures = characterClass?.levelFeatures.filter((feature) => feature.level > entity.level) ?? [];
  const subclassFeatures = subclass?.features.filter((feature) => feature.level <= entity.level) ?? [];
  const companions = campaign.party.memberIds
    .filter((id) => id !== "player")
    .map((id) => campaign.entities[id])
    .filter((entry): entry is Entity => Boolean(entry));
  const focusName = characterClass?.focusName ?? "Focus";
  const spellAttribute = characterClass?.spellAttribute ?? characterClass?.primaryAttributes[0] ?? "int";
  const spellSaveDc = 8 + proficiencyBonus(entity.level) + abilityModifier(entity.attributes[spellAttribute]);
  const subclassOptions =
    characterClass?.subclassIds
      .map((id) => getSubclass(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)) ?? [];
  const featOptions = FEATS.filter(
    (feat) =>
      feat.level <= (milestone.nextLevel ?? entity.level) && !entity.progression.featIds.includes(feat.id),
  );

  const update = async (state: GameState) => {
    await saveCampaign(state);
  };

  const equip = (itemId: string) => {
    const slot = getItem(itemId)?.kind;
    if (!slot) return;
    void update(equipItem(campaign, itemId));
  };

  const roll = (skillId: string) => {
    const { state, result } = rollSkillCheck(campaign, skillId, dc, checkMode);
    const skill = getSkill(skillId);
    setLastRoll({
      name: skill?.name ?? skillId,
      die: result.die,
      modifier: result.modifier,
      total: result.total,
      dc: result.dc,
      success: result.success,
      mode: checkMode,
    });
    void update(state);
  };

  const dismiss = (npcId: string) => {
    const result = dismissCompanion(campaign, npcId);
    if (result.state !== campaign) void update(result.state);
  };

  const spend = (nodeId: string) => {
    const next = spendTalentPoint(campaign, nodeId);
    if (next) void update(next);
  };

  const refund = () => {
    const next = refundTalentPoints(campaign, 25);
    if (next) void update(next);
  };

  const advance = () => {
    const next = applyLevelUp(campaign, {
      ...(milestone.needsSubclass ? { subclassId: subclassChoice } : {}),
      ...(milestone.needsFeat
        ? featChoice
          ? { featId: featChoice }
          : { asiAttribute: (asiChoice || characterClass?.primaryAttributes[0] || "str") as AttributeKey }
        : {}),
    });
    if (next) {
      setSubclassChoice("");
      setFeatChoice("");
      setAsiChoice("");
      void update(next);
    }
  };

  const canAdvance = milestone.pending > 0 && (!milestone.needsSubclass || Boolean(subclassChoice));

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
          <Portrait
            appearance={appearance}
            ancestryId={entity.ancestryId}
            heritageId={entity.heritageId}
            className="size-20 shrink-0 rounded-sm border border-line"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-2xl text-parchment">{entity.name}</h2>
              <span className="chip border-gold/30 text-[9px] text-gold/80">level {entity.level}</span>
              {entity.progression.pendingLevelUps > 0 ? (
                <span className="chip border-gold/40 text-[9px] text-gold-bright">
                  {entity.progression.pendingLevelUps} level-up pending
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-faint">
              {ancestry?.name ?? "Unknown ancestry"}
              {heritage ? ` (${heritage.name})` : ""} · {characterClass?.name ?? "Unknown class"}
              {subclass ? ` (${subclass.name})` : ""} · {background?.name ?? "Unknown background"}
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
                {focusName} {entity.focus.current}/{entity.focus.max}
              </span>
              {specialty ? <span className="chip border-gold/30 text-gold/80">{specialty.name}</span> : null}
            </div>
          </div>
          <button type="button" className="btn btn-ghost px-2! py-1!" onClick={onClose} title="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-4 py-2">
          {(
            [
              ["overview", "Overview", UserRound],
              ["path", "Path", Award],
              ["talents", "Talents", GitBranch],
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
              {id === "talents" && entity.progression.talentPoints > 0 ? (
                <span className="rounded-full bg-gold/20 px-1 font-mono text-[8px] text-gold-bright">
                  {entity.progression.talentPoints}
                </span>
              ) : null}
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
                  <Stat label={focusName} value={`${entity.focus.current} / ${entity.focus.max}`} />
                  <Stat label="Melee attack" value={formatModifier(attackBonus(entity, "str"))} />
                  <Stat label="Ranged / finesse" value={formatModifier(attackBonus(entity, "dex"))} />
                  <Stat label="Spell save DC" value={spellSaveDc} hint={ATTR_LABELS[spellAttribute]} />
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

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Stat label="Passive Perception" value={passiveScore(entity, "perception")} />
                  <Stat label="Passive Insight" value={passiveScore(entity, "insight")} />
                </div>

                <div className="mt-4">
                  <div className="kicker">Traits & resistances</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ancestry?.traits.map((trait) => (
                      <span key={trait.id} className="chip text-[9px]" title={trait.description}>
                        {trait.name}
                      </span>
                    ))}
                    {heritage?.traits.map((trait) => (
                      <span key={trait.id} className="chip text-[9px]" title={trait.description}>
                        {trait.name}
                      </span>
                    ))}
                    {entity.progression.resistances.map((resistance) => (
                      <span key={resistance} className="chip border-gold/30 text-[9px] text-gold/80">
                        {resistance} resistance
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
                                  ancestryId={companion.ancestryId}
                                  heritageId={companion.heritageId}
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
                {entity.progression.pendingLevelUps > 0 ? (
                  <div className="mb-4 border border-gold/35 bg-gold/[0.05] p-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-gold-bright">
                      <Sparkles className="size-3" />
                      Level up available
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-muted">
                      You have {entity.progression.pendingLevelUps} milestone
                      {entity.progression.pendingLevelUps === 1 ? "" : "s"} to spend. Open the Path tab to
                      advance.
                    </p>
                    <button
                      type="button"
                      className="btn mt-2 px-2! py-1! text-[9px]!"
                      onClick={() => setTab("path")}
                    >
                      Open Path
                    </button>
                  </div>
                ) : null}
                <div className="kicker">Abilities</div>
                <div className="mt-2 space-y-2">
                  {entity.abilityIds.map((id) => {
                    const ability = getAbility(id);
                    return (
                      <div key={id} className="border border-line-soft bg-black/10 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-sm text-parchment">{ability?.name ?? id}</span>
                          <span className="chip text-[9px]">
                            {ability?.action ?? "action"} · {ability?.cost ?? 0} {focusName.toLowerCase()}
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

          {tab === "path" ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Level" value={`${entity.level} / ${MAX_LEVEL}`} />
                <Stat label="Milestones" value={entity.progression.milestones} />
                <Stat label="Pending" value={entity.progression.pendingLevelUps} />
                <Stat label="Talent points" value={entity.progression.talentPoints} />
              </div>

              {entity.progression.pendingLevelUps > 0 && milestone.nextLevel ? (
                <div className="border border-gold/35 bg-gold/[0.05] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="kicker">Advance</div>
                      <div className="mt-0.5 font-display text-lg text-parchment">
                        Level {entity.level} → {milestone.nextLevel}
                      </div>
                    </div>
                    <span className="chip">
                      +{Math.max(1, Math.floor((characterClass?.hitDie ?? 8) / 2) + 1)} HP before CON
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {milestone.needsSubclass ? (
                      <label className="text-[10px] text-faint">
                        Subclass
                        <select
                          className="input mt-1 w-full"
                          value={subclassChoice}
                          onChange={(event) => setSubclassChoice(event.target.value)}
                        >
                          <option value="">Choose a path…</option>
                          {subclassOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {milestone.needsFeat ? (
                      <>
                        <label className="text-[10px] text-faint">
                          Feat
                          <select
                            className="input mt-1 w-full"
                            value={featChoice}
                            onChange={(event) => setFeatChoice(event.target.value)}
                          >
                            <option value="">Ability score improvement (+2)</option>
                            {featOptions.map((feat) => (
                              <option key={feat.id} value={feat.id}>
                                {feat.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!featChoice ? (
                          <label className="text-[10px] text-faint">
                            Improve
                            <select
                              className="input mt-1 w-full"
                              value={asiChoice || characterClass?.primaryAttributes[0] || "str"}
                              onChange={(event) => setAsiChoice(event.target.value as AttributeKey)}
                            >
                              {ATTR_KEYS.map((key) => (
                                <option key={key} value={key}>
                                  {ATTR_LABELS[key]} +2
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary mt-3 w-full"
                    onClick={advance}
                    disabled={!canAdvance}
                  >
                    <Sparkles className="size-3.5" />
                    Advance to level {milestone.nextLevel}
                  </button>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border border-line-soft bg-black/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="kicker">Class path</span>
                    <span className="chip">{characterClass?.role ?? "adventurer"}</span>
                  </div>
                  <div className="mt-2 font-display text-lg text-parchment">{characterClass?.name}</div>
                  <p className="mt-1 text-[10px] leading-4 text-muted">{characterClass?.playstyle}</p>
                  <div className="mt-2 text-[10px] text-parchment-dim">
                    Specialty: {specialty?.name ?? "—"}
                  </div>
                  <div className="mt-1 text-[10px] text-parchment-dim">
                    Subclass: {subclass?.name ?? `unlocks at level ${characterClass?.subclassLevel ?? 3}`}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-muted">{subclass?.description}</p>
                </div>
                <div className="border border-line-soft bg-black/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="kicker">Feats & ASI</span>
                    <span className="chip">{featNames.length} feats</span>
                  </div>
                  {featNames.length ? (
                    <div className="mt-2 space-y-1">
                      {featNames.map((name) => (
                        <div key={name} className="text-[10px] text-parchment-dim">
                          {name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-faint">
                      No feats yet. ASI/feat slots arrive at levels 4, 8, and 10.
                    </p>
                  )}
                  <div className="mt-2 text-[9px] text-faint">
                    {Object.entries(entity.progression.asiChoices)
                      .map(([key, value]) => `${ATTR_LABELS[key as AttributeKey]} +${value}`)
                      .join(" · ") || "No ability score improvements yet."}
                  </div>
                </div>
              </div>

              <div>
                <div className="kicker">Class features</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {classFeatures.map((feature) => (
                    <div
                      key={`${feature.level}-${feature.name}`}
                      className="border border-line-soft bg-black/10 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm text-parchment">{feature.name}</span>
                        <span className="chip text-[9px]">level {feature.level}</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted">{feature.description}</p>
                    </div>
                  ))}
                  {subclassFeatures.map((feature) => (
                    <div
                      key={`sub-${feature.level}-${feature.name}`}
                      className="border border-gold/25 bg-gold/[0.03] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm text-parchment">{feature.name}</span>
                        <span className="chip border-gold/30 text-[9px] text-gold/80">
                          subclass · {feature.level}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted">{feature.description}</p>
                    </div>
                  ))}
                </div>
                {nextFeatures.length > 0 ? (
                  <div className="mt-2 text-[9px] text-faint">
                    Next: {nextFeatures[0]!.name} at level {nextFeatures[0]!.level}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="kicker">Recent milestones</div>
                <div className="mt-2 space-y-1">
                  {entity.progression.notes.length ? (
                    entity.progression.notes
                      .slice(-6)
                      .reverse()
                      .map((note) => (
                        <div key={note} className="text-[10px] text-muted">
                          · {note}
                        </div>
                      ))
                  ) : (
                    <p className="text-[10px] text-faint">No milestones recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "talents" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="kicker">Discipline tree</div>
                  <div className="mt-1 font-display text-xl text-parchment">
                    {talentTree?.name ?? "No tree"}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-muted">{talentTree?.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="chip">
                    {entity.progression.talentPoints} point{entity.progression.talentPoints === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    className="btn px-2! py-1! text-[9px]!"
                    onClick={refund}
                    disabled={entity.progression.spentTalentNodeIds.length === 0 || campaign.party.gold < 25}
                    title="Refund all spent talent points for 25 gp at a safe place"
                  >
                    Reflect · 25 gp
                  </button>
                </div>
              </div>

              {talentTree ? (
                <div className="space-y-4">
                  {Array.from(new Set(talentTree.nodes.map((node) => node.branch))).map((branch) => (
                    <div key={branch}>
                      <div className="flex items-center gap-2">
                        <GitBranch className="size-3 text-gold/60" />
                        <span className="text-[10px] uppercase tracking-[0.12em] text-parchment-dim">
                          {branch}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {talentTree.nodes
                          .filter((node) => node.branch === branch)
                          .sort((a, b) => a.tier - b.tier)
                          .map((node) => (
                            <TalentCard
                              key={node.id}
                              node={node}
                              known={spentNodes.has(node.id)}
                              available={availableNodeIds.has(node.id)}
                              points={entity.progression.talentPoints}
                              onSpend={() => spend(node.id)}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-faint">This class has no talent tree yet.</p>
              )}

              <div className="border border-line-soft bg-black/10 p-3 text-[10px] leading-5 text-muted">
                <div className="flex items-center gap-2 text-parchment-dim">
                  <GitBranch className="size-3 text-gold/70" />
                  How talents work
                </div>
                You earn 1 talent point at level 1 and 1 per level. Tier 1 nodes are available immediately;
                tier 2 and 3 nodes gate on level and prerequisites. Points can be reset for 25 gp.
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
                  Roll d20 + modifier. Proficiency adds +{proficiencyBonus(entity.level)}; expertise doubles
                  it.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] text-faint">
                    DC
                    <input
                      className="input w-16 px-2! py-1! font-mono text-[10px]"
                      type="number"
                      min={1}
                      max={40}
                      value={dc}
                      onChange={(event) => setDc(Math.max(1, Math.min(40, Number(event.target.value) || 10)))}
                    />
                  </label>
                  <select
                    className="input w-28 px-2! py-1! text-[10px]"
                    value={checkMode}
                    onChange={(event) => setCheckMode(event.target.value as AdvantageMode)}
                  >
                    <option value="normal">Normal</option>
                    <option value="advantage">Advantage</option>
                    <option value="disadvantage">Disadvantage</option>
                  </select>
                </div>
              </div>
              {lastRoll ? (
                <div className="mt-3 flex items-center gap-2 border border-gold/30 bg-gold/[0.05] px-3 py-1.5">
                  <Dices className="size-3.5 text-gold" />
                  <span className="text-[11px] text-parchment-dim">
                    {lastRoll.name}: d20 {lastRoll.die} {formatModifier(lastRoll.modifier)} ={" "}
                    <span className="font-mono text-gold-bright">{lastRoll.total}</span>
                    {lastRoll.dc !== undefined ? (
                      <span className={lastRoll.success ? "text-moss" : "text-blood"}>
                        {" "}
                        vs DC {lastRoll.dc} · {lastRoll.success ? "success" : "failure"}
                      </span>
                    ) : null}
                    {lastRoll.mode !== "normal" ? ` · ${lastRoll.mode}` : ""}
                  </span>
                </div>
              ) : null}

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
                          {skill.expertise ? <span className="text-gold/80"> · expertise</span> : null}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.1em] text-faint">
                          {ATTR_LABELS[skill.attribute]} · passive {passiveScore(entity, skill.id)}
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border border-line-soft bg-black/10 p-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-faint">
                    <Backpack className="size-3 text-gold/60" />
                    Tool proficiencies
                  </div>
                  <div className="mt-2 text-[10px] leading-4 text-parchment-dim">
                    {entity.progression.toolProficiencyIds.length
                      ? entity.progression.toolProficiencyIds
                          .map((id) => TOOLS.find((entry) => entry.id === id)?.name ?? id)
                          .join(", ")
                      : "None"}
                  </div>
                </div>
                <div className="border border-line-soft bg-black/10 p-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-faint">
                    <Shield className="size-3 text-gold/60" />
                    Languages
                  </div>
                  <div className="mt-2 text-[10px] leading-4 text-parchment-dim">
                    {entity.progression.languageIds.length
                      ? entity.progression.languageIds
                          .map((id) => LANGUAGES.find((entry) => entry.id === id)?.name ?? id)
                          .join(", ")
                      : "Common"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-line-soft px-5 py-3 text-[9px] uppercase tracking-[0.14em] text-faint">
          <span className="flex items-center gap-2">
            <Swords className="size-3 text-gold/50" />
            {characterClass?.name ?? "Adventurer"} · {entity.skillIds.length} proficient skills ·{" "}
            {entity.abilityIds.length} abilities
          </span>
          <span className="flex items-center gap-2">
            <Heart className="size-3 text-blood/70" />
            {entity.hp.current}/{entity.hp.max}
            <Shield className="size-3 text-gold/50" />
            {entity.ac}
          </span>
        </div>
      </Panel>
    </div>
  );
}
