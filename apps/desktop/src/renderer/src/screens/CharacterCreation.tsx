import {
  ANCESTRIES,
  APPEARANCE_PALETTES,
  BACKGROUNDS,
  CLASSES,
  getAbility,
  getAncestry,
  getBackground,
  getClass,
  getItem,
  getSkill,
  SIGIL_IDS,
  SKILLS,
} from "@iwakura/content";
import type {
  AttributeKey,
  Attributes,
  CharacterAppearance,
  CharacterBuild,
  WorldGenParams,
} from "@iwakura/contracts";
import {
  abilityModifier,
  createGameState,
  createPlayerEntity,
  createRng,
  finalAttributes,
  formatModifier,
  proficiencyBonus,
} from "@iwakura/engine";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Dice5,
  Dna,
  ListChecks,
  Loader2,
  Palette,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Portrait } from "../components/Portrait";
import { cn, Panel, SectionLabel, StatusDot } from "../components/ui";
import { useAppStore } from "../state/useAppStore";

const ATTR_KEYS: AttributeKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const ATTR_LABELS: Record<AttributeKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
const POINT_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const DEFAULT_POINT_BUY: Attributes = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
const DEFAULT_PARAMS: WorldGenParams = {
  width: 96,
  height: 96,
  seaLevel: 0.42,
  climate: "varied",
  magicLevel: "standard",
  danger: "normal",
  settlementDensity: 0.5,
};

const FIRST_NAMES = ["Ardan", "Ilyra", "Mara", "Orin", "Sera", "Bram", "Ysolde", "Kael", "Nia", "Tor"];
const SURNAMES = ["Vell", "Ash", "Moor", "Grey", "Thorn", "Reed", "Fen", "Dun", "Wren", "Hale"];

const STEPS = [
  { id: "ancestry", label: "Ancestry", icon: Dna },
  { id: "class", label: "Class", icon: Swords },
  { id: "background", label: "Background", icon: ScrollText },
  { id: "attributes", label: "Attributes", icon: Dice5 },
  { id: "skills", label: "Skills", icon: ListChecks },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "identity", label: "Identity", icon: UserRound },
  { id: "review", label: "Review", icon: ClipboardCheck },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type AttributeMode = "point" | "standard" | "roll";

function pointCost(score: number): number {
  return POINT_COSTS[score] ?? 99;
}

function pointSpent(attributes: Attributes): number {
  return ATTR_KEYS.reduce((sum, key) => sum + pointCost(attributes[key]), 0);
}

function isPermutation(values: number[], pool: number[]): boolean {
  if (values.length !== pool.length) return false;
  const a = [...values].sort((x, y) => x - y);
  const b = [...pool].sort((x, y) => x - y);
  return a.every((value, index) => value === b[index]);
}

function assignedFromPool(pool: number[], classId: string): Attributes {
  const primary = getClass(classId)?.primaryAttributes ?? [];
  const order = [...primary, ...ATTR_KEYS.filter((key) => !primary.includes(key))];
  const values = [...pool].sort((a, b) => b - a);
  const result = { ...DEFAULT_POINT_BUY };
  order.forEach((key, index) => {
    result[key] = values[index] ?? 8;
  });
  return result;
}

function rollScores(): number[] {
  const rng = createRng(`roll:${crypto.randomUUID()}`);
  return Array.from({ length: 6 }, () => {
    const dice = Array.from({ length: 4 }, () => rng.roll(6)).sort((a, b) => b - a);
    return dice.slice(0, 3).reduce((sum, value) => sum + value, 0);
  }).sort((a, b) => b - a);
}

function skillName(id: string): string {
  return getSkill(id)?.name ?? id;
}

function defaultClassSkillPicks(classId: string, backgroundId: string): string[] {
  const characterClass = getClass(classId);
  const background = getBackground(backgroundId);
  const backgroundSkills = background?.skillIds ?? [];
  return (characterClass?.skillChoices ?? [])
    .filter((id) => !backgroundSkills.includes(id))
    .slice(0, characterClass?.skillChoiceCount ?? 0);
}

export function CharacterCreation() {
  const pendingWorld = useAppStore((state) => state.pendingWorld);
  const pendingWorldParams = useAppStore((state) => state.pendingWorldParams);
  const appSettings = useAppStore((state) => state.settings);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const clearPendingWorld = useAppStore((state) => state.clearPendingWorld);
  const setScreen = useAppStore((state) => state.setScreen);

  const [step, setStep] = useState(0);
  const [ancestryId, setAncestryId] = useState("core:human");
  const [classId, setClassId] = useState("core:fighter");
  const [backgroundId, setBackgroundId] = useState("core:soldier");
  const [baseAttributes, setBaseAttributes] = useState<Attributes>({ ...DEFAULT_POINT_BUY });
  const [attributeMode, setAttributeMode] = useState<AttributeMode>("point");
  const [rolledValues, setRolledValues] = useState<number[] | null>(null);
  const [classSkillPicks, setClassSkillPicks] = useState<string[]>(
    defaultClassSkillPicks("core:fighter", "core:soldier"),
  );
  const [extraSkillPicks, setExtraSkillPicks] = useState<string[]>([]);
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    palette: "verdant",
    sigil: "hex",
    seed: crypto.randomUUID(),
  });
  const [name, setName] = useState("");
  const [pronouns, setPronouns] = useState("they/them");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ancestry = getAncestry(ancestryId) ?? getAncestry("core:human")!;
  const characterClass = getClass(classId) ?? getClass("core:fighter")!;
  const background = getBackground(backgroundId) ?? getBackground("core:soldier")!;
  const ancestrySkills = ancestry.grantedSkillIds;
  const backgroundSkills = background.skillIds;
  const pointsRemaining = 27 - pointSpent(baseAttributes);
  const finalBase = finalAttributes(baseAttributes, ancestryId);

  const finalSkillIds = useMemo(
    () =>
      Array.from(
        new Set([...backgroundSkills, ...classSkillPicks, ...ancestrySkills, ...extraSkillPicks]),
      ).filter((id) => Boolean(getSkill(id))),
    [backgroundSkills, classSkillPicks, ancestrySkills, extraSkillPicks],
  );

  const build = useMemo<CharacterBuild>(
    () => ({
      name: name.trim() || "Unnamed Wanderer",
      pronouns,
      ancestryId,
      classId,
      backgroundId,
      baseAttributes,
      skillIds: finalSkillIds,
      appearance,
    }),
    [name, pronouns, ancestryId, classId, backgroundId, baseAttributes, finalSkillIds, appearance],
  );

  const preview = useMemo(() => {
    try {
      return createPlayerEntity(build);
    } catch {
      return null;
    }
  }, [build]);

  const availableClassChoices = characterClass.skillChoices.filter(
    (id) => !backgroundSkills.includes(id) && !ancestrySkills.includes(id),
  );
  const extraChoices = ancestry.extraSkillChoices;
  const extraPool = SKILLS.map((skill) => skill.id).filter(
    (id) => !backgroundSkills.includes(id) && !ancestrySkills.includes(id) && !classSkillPicks.includes(id),
  );

  const updateAttribute = (key: AttributeKey, delta: number) => {
    const next = Math.max(8, Math.min(15, baseAttributes[key] + delta));
    const nextAttributes = { ...baseAttributes, [key]: next };
    if (pointSpent(nextAttributes) > 27) return;
    setBaseAttributes(nextAttributes);
  };

  const applyRolledArray = (values?: number[]) => {
    const rolled = values ?? rollScores();
    setRolledValues(rolled);
    setAttributeMode("roll");
    setBaseAttributes(assignedFromPool(rolled, classId));
  };

  const switchMode = (mode: AttributeMode) => {
    if (mode === "point") {
      setAttributeMode("point");
      if (pointSpent(baseAttributes) !== 27) setBaseAttributes({ ...DEFAULT_POINT_BUY });
      return;
    }
    if (mode === "standard") {
      if (
        !isPermutation(
          ATTR_KEYS.map((key) => baseAttributes[key]),
          STANDARD_ARRAY,
        )
      ) {
        setBaseAttributes(assignedFromPool(STANDARD_ARRAY, classId));
      }
      setAttributeMode("standard");
      return;
    }
    applyRolledArray(rolledValues ?? undefined);
  };

  const setStandardValue = (key: AttributeKey, value: number) => {
    const other = ATTR_KEYS.find((candidate) => candidate !== key && baseAttributes[candidate] === value);
    const next = { ...baseAttributes, [key]: value };
    if (other) next[other] = baseAttributes[key];
    setBaseAttributes(next);
  };

  const selectClass = (id: string) => {
    setClassId(id);
    const nextClass = getClass(id);
    const available = (nextClass?.skillChoices ?? []).filter(
      (skill) => !backgroundSkills.includes(skill) && !ancestrySkills.includes(skill),
    );
    setClassSkillPicks(available.slice(0, nextClass?.skillChoiceCount ?? 0));
    if (attributeMode === "standard") {
      setBaseAttributes(assignedFromPool(STANDARD_ARRAY, id));
    } else if (attributeMode === "roll" && rolledValues) {
      setBaseAttributes(assignedFromPool(rolledValues, id));
    }
  };

  const selectAncestry = (id: string) => {
    setAncestryId(id);
    const nextAncestry = getAncestry(id);
    const nextGranted = nextAncestry?.grantedSkillIds ?? [];
    setClassSkillPicks((picks) => picks.filter((skill) => !nextGranted.includes(skill)));
    if (!nextAncestry || nextAncestry.extraSkillChoices === 0) setExtraSkillPicks([]);
    else setExtraSkillPicks((picks) => picks.slice(0, nextAncestry.extraSkillChoices));
  };

  const selectBackground = (id: string) => {
    setBackgroundId(id);
    const nextBackground = getBackground(id);
    const nextSkills = nextBackground?.skillIds ?? [];
    setClassSkillPicks((picks) => picks.filter((skill) => !nextSkills.includes(skill)));
    setExtraSkillPicks((picks) => picks.filter((skill) => !nextSkills.includes(skill)));
  };

  const toggleClassSkill = (id: string) => {
    setClassSkillPicks((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= characterClass.skillChoiceCount) return current;
      return [...current, id];
    });
  };

  const toggleExtraSkill = (id: string) => {
    setExtraSkillPicks((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= extraChoices) return current;
      return [...current, id];
    });
  };

  const attributesValid =
    attributeMode === "point"
      ? pointsRemaining === 0
      : attributeMode === "standard"
        ? isPermutation(
            ATTR_KEYS.map((key) => baseAttributes[key]),
            STANDARD_ARRAY,
          )
        : Boolean(rolledValues) &&
          isPermutation(
            ATTR_KEYS.map((key) => baseAttributes[key]),
            rolledValues ?? [],
          );

  const skillsValid =
    classSkillPicks.length === characterClass.skillChoiceCount && extraSkillPicks.length === extraChoices;

  const stepValid: Record<StepId, boolean> = {
    ancestry: Boolean(getAncestry(ancestryId)),
    class: Boolean(getClass(classId)),
    background: Boolean(getBackground(backgroundId)),
    attributes: attributesValid,
    skills: skillsValid,
    appearance: Boolean(appearance.palette && appearance.sigil && appearance.seed),
    identity: name.trim().length >= 2,
    review: attributesValid && skillsValid && name.trim().length >= 2,
  };

  const currentStep = STEPS[step]!;
  const canGoNext = stepValid[currentStep.id];
  const canFinish = STEPS.every((entry) => stepValid[entry.id]);

  const begin = async () => {
    if (!pendingWorld || !canFinish || !preview) return;
    setSaving(true);
    setError(null);
    try {
      const state = createGameState({
        world: pendingWorld.world,
        settings: {
          worldSource: pendingWorld.world.source,
          worldPackId: pendingWorld.world.packId,
          seed: pendingWorld.world.seed,
          genParams: pendingWorldParams ?? DEFAULT_PARAMS,
          difficulty: appSettings?.settings.difficulty ?? "normal",
          contentRating: appSettings?.settings.contentRating ?? "teen",
          aiEnabled: appSettings?.settings.ai.aiEnabled ?? true,
        },
        campaignId: crypto.randomUUID(),
        campaignName: pendingWorld.world.name,
        build,
      });
      await saveCampaign(state);
      clearPendingWorld();
      setScreen("world");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!pendingWorld) {
    return (
      <div className="grid h-full place-items-center px-8">
        <Panel className="max-w-md p-6">
          <SectionLabel>No world awaiting</SectionLabel>
          <h1 className="mt-2 font-display text-2xl text-parchment">Generate a world first</h1>
          <p className="mt-2 text-xs leading-5 text-muted">
            Character creation needs a generated or handcrafted world. Return to New Chronicle and choose a
            world source.
          </p>
          <button type="button" className="btn btn-primary mt-5" onClick={() => setScreen("campaign")}>
            Back to world setup
          </button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <button
              type="button"
              className="btn btn-ghost px-0! text-[10px]!"
              onClick={() => setScreen("campaign")}
            >
              <ArrowLeft className="size-3" />
              Back to world setup
            </button>
            <SectionLabel className="mt-3">The first page</SectionLabel>
            <h1 className="mt-1 font-display text-4xl tracking-wide text-parchment">Shape a Wanderer</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              Your choices here are the rules the rest of the chronicle will push against. The engine derives
              the numbers; you choose the shape.
            </p>
          </div>
          <span className="chip">
            <StatusDot tone="ok" />
            {pendingWorld.world.name} · {pendingWorld.world.source}
          </span>
        </div>

        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[210px_1fr_300px]">
          <Panel className="p-3">
            <SectionLabel className="px-2">Path</SectionLabel>
            <div className="mt-2 space-y-1">
              {STEPS.map((entry, index) => {
                const Icon = entry.icon;
                const active = index === step;
                const complete = index < step && stepValid[entry.id];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-gold/45 bg-gold/[0.06] text-parchment"
                        : "border-transparent text-muted hover:border-line-soft hover:text-parchment-dim",
                    )}
                    onClick={() => setStep(index)}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center border text-[10px]",
                        active
                          ? "border-gold/50 text-gold-bright"
                          : complete
                            ? "border-moss/50 text-moss"
                            : "border-line text-faint",
                      )}
                    >
                      {complete ? <Check className="size-3" /> : <Icon className="size-3" />}
                    </span>
                    <span className="flex-1 text-[11px] uppercase tracking-[0.12em]">{entry.label}</span>
                    <span className="font-mono text-[9px] text-faint">{index + 1}</span>
                  </button>
                );
              })}
            </div>
            <div className="rule my-3" />
            <div className="px-2 text-[10px] leading-5 text-faint">
              Every step can be revisited. Nothing is locked until you begin the chronicle.
            </div>
          </Panel>

          <Panel lit className="min-h-[560px] p-6">
            <div className="flex items-center justify-between">
              <div>
                <SectionLabel>{currentStep.label}</SectionLabel>
                <div className="mt-1 font-display text-2xl text-parchment">{stepTitle(currentStep.id)}</div>
              </div>
              <span className="font-mono text-[10px] text-faint">
                {step + 1} / {STEPS.length}
              </span>
            </div>

            <div className="mt-5">
              {currentStep.id === "ancestry" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {ANCESTRIES.map((entry) => {
                    const isSelected = ancestryId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          "border p-4 text-left transition-colors",
                          isSelected
                            ? "border-gold/60 bg-gold/[0.06]"
                            : "border-line-soft bg-black/10 hover:border-line",
                        )}
                        onClick={() => selectAncestry(entry.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display text-lg text-parchment">{entry.name}</span>
                          {isSelected ? <Check className="size-4 text-gold" /> : null}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gold/70">
                          {formatBonuses(entry.bonuses)}
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-muted">{entry.description}</p>
                        <div className="mt-3 space-y-1 border-t border-line-soft pt-2 text-[10px] leading-4 text-faint">
                          {entry.traits.map((trait) => (
                            <div key={trait.id}>
                              <span className="text-parchment-dim">{trait.name}</span> — {trait.description}
                            </div>
                          ))}
                          <div>Movement {entry.movement} hexes</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {currentStep.id === "class" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {CLASSES.map((entry) => {
                    const isSelected = classId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          "border p-4 text-left transition-colors",
                          isSelected
                            ? "border-gold/60 bg-gold/[0.06]"
                            : "border-line-soft bg-black/10 hover:border-line",
                        )}
                        onClick={() => selectClass(entry.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display text-lg text-parchment">{entry.name}</span>
                          {isSelected ? <Check className="size-4 text-gold" /> : null}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gold/70">
                          d{entry.hitDie} · {entry.focusName} ·{" "}
                          {entry.primaryAttributes.map((key) => ATTR_LABELS[key]).join(" / ")}
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-muted">{entry.description}</p>
                        <div className="mt-3 space-y-1 border-t border-line-soft pt-2 text-[10px] leading-4 text-faint">
                          <div>Saves: {entry.savingThrows.map((key) => ATTR_LABELS[key]).join(", ")}</div>
                          <div>Armor: {entry.armorProficiency.join(", ") || "none"}</div>
                          <div>Weapons: {entry.weaponProficiency.join(", ")}</div>
                          <div>Skills: choose {entry.skillChoiceCount}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {currentStep.id === "background" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {BACKGROUNDS.map((entry) => {
                    const isSelected = backgroundId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          "border p-4 text-left transition-colors",
                          isSelected
                            ? "border-gold/60 bg-gold/[0.06]"
                            : "border-line-soft bg-black/10 hover:border-line",
                        )}
                        onClick={() => selectBackground(entry.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display text-lg text-parchment">{entry.name}</span>
                          {isSelected ? <Check className="size-4 text-gold" /> : null}
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-muted">{entry.description}</p>
                        <div className="mt-3 space-y-1 border-t border-line-soft pt-2 text-[10px] leading-4 text-faint">
                          <div>Skills: {entry.skillIds.map(skillName).join(", ")}</div>
                          <div>Tool: {entry.toolOrLanguage}</div>
                          <div>
                            Start: {entry.startingItemIds.map((id) => getItem(id)?.name ?? id).join(" + ")}
                          </div>
                          <div className="text-parchment-dim">{entry.hook}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {currentStep.id === "attributes" ? (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {(["point", "standard", "roll"] as AttributeMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={cn("chip", attributeMode === mode && "border-gold/60 text-gold-bright")}
                          onClick={() => switchMode(mode)}
                        >
                          {mode === "point" ? "Point buy" : mode === "standard" ? "Standard array" : "Rolled"}
                        </button>
                      ))}
                    </div>
                    {attributeMode === "point" ? (
                      <span
                        className={cn(
                          "chip",
                          pointsRemaining === 0 ? "border-moss/40 text-moss" : "border-gold/30 text-gold",
                        )}
                      >
                        {pointsRemaining} points left
                      </span>
                    ) : attributeMode === "standard" ? (
                      <span className="chip">15 · 14 · 13 · 12 · 10 · 8</span>
                    ) : (
                      <button type="button" className="btn px-3! py-1!" onClick={() => applyRolledArray()}>
                        <Dice5 className="size-3" />
                        Reroll 4d6
                      </button>
                    )}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {ATTR_KEYS.map((key) => {
                      const final = finalBase[key];
                      return (
                        <div key={key} className="border border-line-soft bg-black/10 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-parchment-dim">
                                {ATTR_LABELS[key]}
                              </div>
                              <div className="text-[9px] uppercase tracking-[0.1em] text-faint">
                                {ancestry.bonuses[key]
                                  ? `${formatModifier(ancestry.bonuses[key]!)} ancestry`
                                  : "no ancestry bonus"}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-lg text-parchment">{final}</div>
                              <div className="text-[10px] text-gold/80">
                                {formatModifier(abilityModifier(final))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {attributeMode === "point" ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="btn px-2! py-0.5!"
                                  onClick={() => updateAttribute(key, -1)}
                                  disabled={baseAttributes[key] <= 8}
                                >
                                  −
                                </button>
                                <span className="w-6 text-center font-mono text-sm text-parchment">
                                  {baseAttributes[key]}
                                </span>
                                <button
                                  type="button"
                                  className="btn px-2! py-0.5!"
                                  onClick={() => updateAttribute(key, 1)}
                                  disabled={baseAttributes[key] >= 15}
                                >
                                  +
                                </button>
                              </div>
                            ) : attributeMode === "standard" ? (
                              <select
                                className="input w-24"
                                value={baseAttributes[key]}
                                onChange={(event) => setStandardValue(key, Number(event.target.value))}
                              >
                                {STANDARD_ARRAY.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-mono text-sm text-parchment-dim">
                                {baseAttributes[key]}
                              </span>
                            )}
                            <span className="text-[9px] text-faint">base</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[10px] leading-5 text-faint">
                    Ancestry bonuses are applied on top of the base score. Point buy uses 27 points on a 8–15
                    scale. Rolled scores use 4d6 drop lowest and are assigned with class priorities.
                  </p>
                </div>
              ) : null}

              {currentStep.id === "skills" ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="kicker">From background</span>
                      <span className="chip">granted</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {backgroundSkills.map((id) => (
                        <span key={id} className="chip border-moss/30 text-[#c6d1a4]">
                          <Check className="size-3" />
                          {skillName(id)}
                        </span>
                      ))}
                      {ancestrySkills.map((id) => (
                        <span key={id} className="chip border-moss/30 text-[#c6d1a4]">
                          <Check className="size-3" />
                          {skillName(id)} · ancestry
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="kicker">Class choices</span>
                      <span className="chip">
                        {classSkillPicks.length}/{characterClass.skillChoiceCount}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {availableClassChoices.map((id) => {
                        const selected = classSkillPicks.includes(id);
                        const disabled =
                          !selected && classSkillPicks.length >= characterClass.skillChoiceCount;
                        return (
                          <button
                            key={id}
                            type="button"
                            className={cn(
                              "flex items-center justify-between border px-3 py-2 text-left text-[11px] transition-colors",
                              selected
                                ? "border-gold/50 bg-gold/[0.06] text-parchment"
                                : disabled
                                  ? "border-line-soft text-faint"
                                  : "border-line-soft text-parchment-dim hover:border-line",
                            )}
                            onClick={() => toggleClassSkill(id)}
                            disabled={disabled}
                          >
                            <span>{skillName(id)}</span>
                            {selected ? <Check className="size-3.5 text-gold" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {extraChoices > 0 ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="kicker">Ancestry versatility</span>
                        <span className="chip">
                          {extraSkillPicks.length}/{extraChoices}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {extraPool.map((id) => {
                          const selected = extraSkillPicks.includes(id);
                          const disabled = !selected && extraSkillPicks.length >= extraChoices;
                          return (
                            <button
                              key={id}
                              type="button"
                              className={cn(
                                "chip",
                                selected
                                  ? "border-gold/50 text-gold-bright"
                                  : disabled
                                    ? "text-faint"
                                    : "hover:border-line",
                              )}
                              onClick={() => toggleExtraSkill(id)}
                              disabled={disabled}
                            >
                              {selected ? <Check className="size-3" /> : null}
                              {skillName(id)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {currentStep.id === "appearance" ? (
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  <Portrait appearance={appearance} className="w-full rounded-sm border border-line" />
                  <div>
                    <span className="kicker">Palette</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {APPEARANCE_PALETTES.map((palette) => (
                        <button
                          key={palette.id}
                          type="button"
                          className={cn(
                            "flex items-center gap-2 border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em]",
                            appearance.palette === palette.id
                              ? "border-gold/60 text-parchment"
                              : "border-line-soft text-muted hover:border-line",
                          )}
                          onClick={() => setAppearance((current) => ({ ...current, palette: palette.id }))}
                        >
                          <span
                            className="size-3 rounded-full border border-black/40"
                            style={{ background: palette.trim }}
                          />
                          {palette.name}
                        </button>
                      ))}
                    </div>

                    <span className="kicker mt-5 block">Sigil</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {SIGIL_IDS.map((sigil) => (
                        <button
                          key={sigil}
                          type="button"
                          className={cn(
                            "chip",
                            appearance.sigil === sigil && "border-gold/60 text-gold-bright",
                          )}
                          onClick={() => setAppearance((current) => ({ ...current, sigil }))}
                        >
                          {sigil}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center gap-2">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setAppearance((current) => ({ ...current, seed: crypto.randomUUID() }))
                        }
                      >
                        <Dice5 className="size-3.5" />
                        Reroll face
                      </button>
                      <span className="font-mono text-[9px] text-faint">{appearance.seed.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep.id === "identity" ? (
                <div className="max-w-xl space-y-4">
                  <div>
                    <label className="label" htmlFor="character-name">
                      Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="character-name"
                        className="input font-display text-lg"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="What do they call you?"
                        maxLength={60}
                      />
                      <button
                        type="button"
                        className="btn shrink-0 px-3!"
                        title="Suggest a name"
                        onClick={() =>
                          setName(
                            `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${
                              SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
                            }`,
                          )
                        }
                      >
                        <Dice5 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="character-pronouns">
                      Pronouns
                    </label>
                    <select
                      id="character-pronouns"
                      className="input max-w-xs"
                      value={pronouns}
                      onChange={(event) => setPronouns(event.target.value)}
                    >
                      <option value="they/them">they / them</option>
                      <option value="she/her">she / her</option>
                      <option value="he/him">he / him</option>
                      <option value="ze/hir">ze / hir</option>
                    </select>
                  </div>
                  <p className="text-[11px] leading-5 text-muted">
                    The chronicle will remember this name. Companions and NPCs will use it when they speak to
                    you.
                  </p>
                </div>
              ) : null}

              {currentStep.id === "review" ? (
                <div className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                    <Portrait appearance={appearance} className="w-full rounded-sm border border-line" />
                    <div>
                      <div className="font-display text-3xl text-parchment">
                        {name.trim() || "Unnamed Wanderer"}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-gold/80">
                        {ancestry.name} · {characterClass.name} · {background.name}
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-muted">{background.hook}</p>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <DerivedStat label="HP" value={preview?.hp.max ?? "—"} />
                        <DerivedStat label="AC" value={preview?.ac ?? "—"} />
                        <DerivedStat label="Focus" value={preview?.focus.max ?? "—"} />
                        <DerivedStat label="Speed" value={preview?.speed ?? "—"} />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="border border-line-soft bg-black/10 p-3">
                      <span className="kicker">Skills</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {finalSkillIds.map((id) => (
                          <span key={id} className="chip text-[9px]">
                            {skillName(id)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="border border-line-soft bg-black/10 p-3">
                      <span className="kicker">Starting kit</span>
                      <div className="mt-2 space-y-1 text-[10px] text-parchment-dim">
                        {preview?.inventory.map((entry) => (
                          <div key={entry.itemId} className="flex justify-between gap-2">
                            <span>{getItem(entry.itemId)?.name ?? entry.itemId}</span>
                            <span className="text-faint">×{entry.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border border-line-soft bg-black/10 p-3">
                    <span className="kicker">Abilities</span>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {characterClass.startingAbilityIds.map((id) => {
                        const ability = getAbility(id);
                        return (
                          <div key={id} className="border border-line-soft/70 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display text-sm text-parchment">
                                {ability?.name ?? id}
                              </span>
                              <span className="chip">{ability?.cost ?? 0} focus</span>
                            </div>
                            <p className="mt-1 text-[10px] leading-4 text-muted">{ability?.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="mt-5 border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-[#e0b0aa]">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0}
              >
                <ChevronLeft className="size-3.5" />
                Back
              </button>
              <div className="flex items-center gap-2">
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
                    disabled={!canGoNext}
                  >
                    Next
                    <ChevronRight className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void begin()}
                    disabled={!canFinish || saving}
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {saving ? "Writing the first page…" : "Begin chronicle"}
                  </button>
                )}
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Preview</SectionLabel>
              <span className="chip">{characterClass.focusName}</span>
            </div>
            <Portrait appearance={appearance} className="mt-3 w-full rounded-sm border border-line" />
            <div className="mt-3">
              <div className="font-display text-xl text-parchment">{name.trim() || "Unnamed Wanderer"}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-faint">
                {ancestry.name} · {characterClass.name}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <DerivedStat label="HP" value={preview?.hp.max ?? "—"} />
              <DerivedStat label="AC" value={preview?.ac ?? "—"} />
              <DerivedStat label={characterClass.focusName} value={preview?.focus.max ?? "—"} />
              <DerivedStat label="Speed" value={preview?.speed ?? "—"} />
            </div>
            <div className="rule my-3" />
            <div className="space-y-1.5">
              {ATTR_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between text-[10px]">
                  <span className="text-faint">{ATTR_LABELS[key]}</span>
                  <span className="font-mono text-parchment-dim">
                    {finalBase[key]} ({formatModifier(abilityModifier(finalBase[key]))})
                  </span>
                </div>
              ))}
            </div>
            <div className="rule my-3" />
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <div className="kicker">Proficiency</div>
                <div className="mt-1 font-mono text-parchment-dim">+{proficiencyBonus(1)}</div>
              </div>
              <div>
                <div className="kicker">Skills</div>
                <div className="mt-1 font-mono text-parchment-dim">{finalSkillIds.length}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-faint">
              <Shield className="size-3 text-gold/60" />
              {preview?.equipment.armor ? getItem(preview.equipment.armor)?.name : "Unarmored"}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function stepTitle(id: StepId): string {
  switch (id) {
    case "ancestry":
      return "Where the blood remembers";
    case "class":
      return "What the hands know";
    case "background":
      return "What the road taught";
    case "attributes":
      return "The raw material";
    case "skills":
      return "What you are good at";
    case "appearance":
      return "A face for the road";
    case "identity":
      return "A name to carry";
    case "review":
      return "The first page";
    default:
      return "";
  }
}

function formatBonuses(bonuses: Partial<Record<AttributeKey, number>>): string {
  return Object.entries(bonuses)
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `${ATTR_LABELS[key as AttributeKey].slice(0, 3)} ${formatModifier(Number(value))}`)
    .join(" · ");
}

function DerivedStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line-soft bg-black/10 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-parchment">{value}</div>
    </div>
  );
}
