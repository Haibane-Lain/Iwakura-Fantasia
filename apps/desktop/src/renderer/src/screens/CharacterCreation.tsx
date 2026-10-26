import {
  ANCESTRIES,
  APPEARANCE_PALETTES,
  BACKGROUNDS,
  CLASSES,
  getAbility,
  getAncestry,
  getBackground,
  getClass,
  getHeritage,
  getItem,
  getSkill,
  getSubclass,
  getTalentTree,
  LANGUAGES,
  SIGIL_IDS,
  SKILLS,
  TOOLS,
} from "@iwakura/content";
import type {
  AttributeKey,
  Attributes,
  CharacterAppearance,
  CharacterBuild,
  FeatureEffect,
  TalentNode,
  WorldGenParams,
} from "@iwakura/contracts";
import {
  abilityModifier,
  createGameState,
  createPlayerEntity,
  createRng,
  finalAttributes,
  formatModifier,
  passiveScore,
  proficiencyBonus,
  totalTalentPoints,
  validateCharacterBuild,
} from "@iwakura/engine";
import {
  ArrowLeft,
  Backpack,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Dice5,
  Dna,
  GitBranch,
  Languages,
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
  { id: "skills", label: "Proficiencies", icon: ListChecks },
  { id: "talents", label: "Talent", icon: GitBranch },
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

function toolName(id: string): string {
  return TOOLS.find((entry) => entry.id === id)?.name ?? id;
}

function languageName(id: string): string {
  return LANGUAGES.find((entry) => entry.id === id)?.name ?? id;
}

function defaultClassSkillPicks(classId: string, backgroundId: string, ancestryId: string): string[] {
  const characterClass = getClass(classId);
  const background = getBackground(backgroundId);
  const ancestry = getAncestry(ancestryId);
  const granted = new Set([
    ...(background?.skillIds ?? []),
    ...(ancestry?.grantedSkillIds ?? []),
    ...effectSkills(ancestry?.traits.flatMap((trait) => trait.effects ?? []) ?? []),
  ]);
  return (characterClass?.skillChoices ?? [])
    .filter((id) => !granted.has(id))
    .slice(0, characterClass?.skillChoiceCount ?? 0);
}

function effectSkills(effects: FeatureEffect[]): string[] {
  return effects
    .filter(
      (effect): effect is Extract<FeatureEffect, { kind: "skill_proficiency" }> =>
        effect.kind === "skill_proficiency",
    )
    .map((effect) => effect.skillId);
}

function effectTools(effects: FeatureEffect[]): string[] {
  return effects
    .filter(
      (effect): effect is Extract<FeatureEffect, { kind: "tool_proficiency" }> =>
        effect.kind === "tool_proficiency",
    )
    .map((effect) => effect.toolId);
}

function effectLanguages(effects: FeatureEffect[]): string[] {
  return effects
    .filter((effect): effect is Extract<FeatureEffect, { kind: "language" }> => effect.kind === "language")
    .map((effect) => effect.languageId);
}

function effectLabel(effect: FeatureEffect): string {
  switch (effect.kind) {
    case "skill_proficiency":
      return `${skillName(effect.skillId)} proficiency`;
    case "expertise":
      return `${skillName(effect.skillId)} expertise`;
    case "tool_proficiency":
      return `${toolName(effect.toolId)} proficiency`;
    case "language":
      return `${languageName(effect.languageId)} language`;
    case "resistance":
      return `${effect.damageType} resistance`;
    case "grant_ability":
      return `Ability: ${getAbility(effect.abilityId)?.name ?? effect.abilityId}`;
    case "stat": {
      const target =
        effect.stat === "skill"
          ? effect.skillId
            ? skillName(effect.skillId)
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

function effectsSummary(effects: FeatureEffect[] | undefined): string[] {
  return (effects ?? []).map(effectLabel).filter(Boolean);
}

const initialClass = getClass("core:fighter")!;
const initialBackground = getBackground("core:soldier")!;
const initialAncestry = getAncestry("core:human")!;

export function CharacterCreation() {
  const pendingWorld = useAppStore((state) => state.pendingWorld);
  const pendingWorldParams = useAppStore((state) => state.pendingWorldParams);
  const appSettings = useAppStore((state) => state.settings);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const clearPendingWorld = useAppStore((state) => state.clearPendingWorld);
  const setScreen = useAppStore((state) => state.setScreen);

  const [step, setStep] = useState(0);
  const [ancestryId, setAncestryId] = useState("core:human");
  const [heritageId, setHeritageId] = useState("core:heritage_frontier");
  const [classId, setClassId] = useState("core:fighter");
  const [specialtyId, setSpecialtyId] = useState("core:style_dueling");
  const [kitId, setKitId] = useState("core:kit_fighter_guard");
  const [backgroundId, setBackgroundId] = useState("core:soldier");
  const [baseAttributes, setBaseAttributes] = useState<Attributes>({ ...DEFAULT_POINT_BUY });
  const [attributeMode, setAttributeMode] = useState<AttributeMode>("point");
  const [rolledValues, setRolledValues] = useState<number[] | null>(null);
  const [classSkillPicks, setClassSkillPicks] = useState<string[]>(
    defaultClassSkillPicks("core:fighter", "core:soldier", "core:human"),
  );
  const [extraSkillPicks, setExtraSkillPicks] = useState<string[]>([]);
  const [expertisePicks, setExpertisePicks] = useState<string[]>([]);
  const [talentNodeIds, setTalentNodeIds] = useState<string[]>([]);
  const [extraLanguageId, setExtraLanguageId] = useState("");
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    palette: "verdant",
    sigil: "hex",
    seed: crypto.randomUUID(),
  });
  const [name, setName] = useState("");
  const [pronouns, setPronouns] = useState("they/them");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ancestry = getAncestry(ancestryId) ?? initialAncestry;
  const heritage = getHeritage(ancestryId, heritageId) ?? ancestry.heritages[0];
  const characterClass = getClass(classId) ?? initialClass;
  const background = getBackground(backgroundId) ?? initialBackground;
  const specialty =
    characterClass.specialties.find((entry) => entry.id === specialtyId) ?? characterClass.specialties[0];
  const kit =
    characterClass.startingKits.find((entry) => entry.id === kitId) ?? characterClass.startingKits[0];
  const talentTree = characterClass.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined;
  const subclassPreview = characterClass.subclassIds
    .map((id) => getSubclass(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const pointsRemaining = 27 - pointSpent(baseAttributes);
  const finalBase = finalAttributes(baseAttributes, ancestryId, heritageId);

  const ancestrySkillIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...ancestry.grantedSkillIds,
          ...effectSkills(ancestry.traits.flatMap((trait) => trait.effects ?? [])),
          ...effectSkills(heritage?.traits.flatMap((trait) => trait.effects ?? []) ?? []),
          ...effectSkills(heritage?.effects ?? []),
        ]),
      ),
    [ancestry, heritage],
  );
  const backgroundSkills = background.skillIds;
  const finalSkillIds = useMemo(
    () =>
      Array.from(
        new Set([...backgroundSkills, ...classSkillPicks, ...ancestrySkillIds, ...extraSkillPicks]),
      ).filter((id) => Boolean(getSkill(id))),
    [backgroundSkills, classSkillPicks, ancestrySkillIds, extraSkillPicks],
  );
  const backgroundTools = Array.from(
    new Set([
      ...(background.toolProficiencyIds ?? []),
      ...effectTools(heritage?.traits.flatMap((trait) => trait.effects ?? []) ?? []),
      ...effectTools(heritage?.effects ?? []),
    ]),
  );
  const backgroundLanguages = Array.from(
    new Set([
      ...(background.languageIds ?? []),
      ...effectLanguages(heritage?.traits.flatMap((trait) => trait.effects ?? []) ?? []),
      ...effectLanguages(heritage?.effects ?? []),
    ]),
  );
  const selectedTalent = talentNodeIds
    .map((id) => talentTree?.nodes.find((node) => node.id === id))
    .find((node): node is TalentNode => Boolean(node));
  const talentOptions =
    talentTree?.nodes.filter((node) => node.level <= 1 && node.prerequisites.length === 0) ?? [];

  const availableClassChoices = characterClass.skillChoices.filter(
    (id) => !backgroundSkills.includes(id) && !ancestrySkillIds.includes(id),
  );
  const extraChoices = ancestry.extraSkillChoices;
  const extraPool = SKILLS.map((skill) => skill.id).filter(
    (id) => !backgroundSkills.includes(id) && !ancestrySkillIds.includes(id) && !classSkillPicks.includes(id),
  );
  const expertiseLimit = characterClass.id === "core:rogue" ? 2 : 0;
  const expertiseEligible = finalSkillIds.filter((id) => !expertisePicks.includes(id));

  const build = useMemo<CharacterBuild>(
    () => ({
      name: name.trim() || "Unnamed Wanderer",
      pronouns,
      ancestryId,
      heritageId: heritage?.id,
      classId,
      specialtyId: specialty?.id,
      kitId: kit?.id,
      backgroundId,
      baseAttributes,
      skillIds: finalSkillIds,
      expertiseSkillIds: expertisePicks,
      toolProficiencyIds: [],
      languageIds: extraLanguageId ? [extraLanguageId] : [],
      talentNodeIds,
      featIds: [],
      startLevel: 1,
      appearance,
    }),
    [
      name,
      pronouns,
      ancestryId,
      heritage?.id,
      classId,
      specialty?.id,
      kit?.id,
      backgroundId,
      baseAttributes,
      finalSkillIds,
      expertisePicks,
      extraLanguageId,
      talentNodeIds,
      appearance,
    ],
  );

  const validationErrors = useMemo(() => validateCharacterBuild(build), [build]);
  const preview = useMemo(() => {
    if (validationErrors.length > 0) return null;
    try {
      return createPlayerEntity(build);
    } catch {
      return null;
    }
  }, [build, validationErrors.length]);

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

  const setPoolValue = (key: AttributeKey, value: number, pool: number[]) => {
    const other = ATTR_KEYS.find((candidate) => candidate !== key && baseAttributes[candidate] === value);
    const next = { ...baseAttributes, [key]: value };
    if (other && pool.includes(baseAttributes[key])) next[other] = baseAttributes[key];
    setBaseAttributes(next);
  };

  const selectClass = (id: string) => {
    const nextClass = getClass(id);
    setClassId(id);
    setSpecialtyId(nextClass?.specialties[0]?.id ?? "");
    setKitId(nextClass?.startingKits[0]?.id ?? "");
    setTalentNodeIds([]);
    setExpertisePicks([]);
    const available = (nextClass?.skillChoices ?? []).filter(
      (skill) => !backgroundSkills.includes(skill) && !ancestrySkillIds.includes(skill),
    );
    setClassSkillPicks(available.slice(0, nextClass?.skillChoiceCount ?? 0));
    if (attributeMode === "standard") {
      setBaseAttributes(assignedFromPool(STANDARD_ARRAY, id));
    } else if (attributeMode === "roll" && rolledValues) {
      setBaseAttributes(assignedFromPool(rolledValues, id));
    }
  };

  const selectAncestry = (id: string) => {
    const nextAncestry = getAncestry(id);
    setAncestryId(id);
    const nextHeritage = nextAncestry?.heritages[0];
    setHeritageId(nextHeritage?.id ?? "");
    const nextGranted = new Set([
      ...(nextAncestry?.grantedSkillIds ?? []),
      ...effectSkills(nextAncestry?.traits.flatMap((trait) => trait.effects ?? []) ?? []),
      ...effectSkills(nextHeritage?.traits.flatMap((trait) => trait.effects ?? []) ?? []),
    ]);
    setClassSkillPicks((picks) => picks.filter((skill) => !nextGranted.has(skill)));
    setExpertisePicks([]);
    if (!nextAncestry || nextAncestry.extraSkillChoices === 0) setExtraSkillPicks([]);
    else setExtraSkillPicks((picks) => picks.slice(0, nextAncestry.extraSkillChoices));
  };

  const selectHeritage = (id: string) => {
    setHeritageId(id);
    const nextHeritage = getHeritage(ancestryId, id);
    const nextSkills = new Set([
      ...(nextHeritage?.traits.flatMap((trait) => effectSkills(trait.effects ?? [])) ?? []),
      ...effectSkills(nextHeritage?.effects ?? []),
    ]);
    setClassSkillPicks((picks) => picks.filter((skill) => !nextSkills.has(skill)));
    setExtraSkillPicks((picks) => picks.filter((skill) => !nextSkills.has(skill)));
    setExpertisePicks([]);
  };

  const selectBackground = (id: string) => {
    setBackgroundId(id);
    const nextBackground = getBackground(id);
    const nextSkills = nextBackground?.skillIds ?? [];
    setClassSkillPicks((picks) => picks.filter((skill) => !nextSkills.includes(skill)));
    setExtraSkillPicks((picks) => picks.filter((skill) => !nextSkills.includes(skill)));
    setExpertisePicks([]);
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

  const toggleExpertise = (id: string) => {
    setExpertisePicks((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= expertiseLimit) return current;
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
    classSkillPicks.length === characterClass.skillChoiceCount &&
    extraSkillPicks.length === extraChoices &&
    expertisePicks.length === expertiseLimit &&
    expertisePicks.every((id) => finalSkillIds.includes(id));

  const talentValid = talentOptions.length === 0 || talentNodeIds.length === 1;

  const stepValid: Record<StepId, boolean> = {
    ancestry: Boolean(getAncestry(ancestryId) && heritage),
    class: Boolean(getClass(classId) && specialty && kit),
    background: Boolean(getBackground(backgroundId)),
    attributes: attributesValid,
    skills: skillsValid,
    talents: talentValid,
    appearance: Boolean(appearance.palette && appearance.sigil && appearance.seed),
    identity: name.trim().length >= 2,
    review:
      attributesValid &&
      skillsValid &&
      talentValid &&
      name.trim().length >= 2 &&
      validationErrors.length === 0 &&
      Boolean(preview),
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
              Your choices here are the rules the rest of the chronicle will push against. Ancestry, heritage,
              path, training, and the first talent all matter.
            </p>
          </div>
          <span className="chip">
            <StatusDot tone="ok" />
            {pendingWorld.world.name} · {pendingWorld.world.source}
          </span>
        </div>

        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[210px_1fr_320px]">
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

          <Panel lit className="min-h-[600px] p-6">
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
                <div className="space-y-5">
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
                                {trait.effects?.length ? (
                                  <span className="text-gold/70">
                                    {" "}
                                    · {effectsSummary(trait.effects).join(", ")}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                            <div>Movement {entry.movement} hexes</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="kicker">Heritage</span>
                      <span className="chip">{ancestry.heritages.length} paths</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {ancestry.heritages.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={cn(
                            "border p-3 text-left text-[11px]",
                            heritage?.id === entry.id
                              ? "border-gold/50 bg-gold/[0.05] text-parchment"
                              : "border-line-soft text-parchment-dim hover:border-line",
                          )}
                          onClick={() => selectHeritage(entry.id)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display text-sm">{entry.name}</span>
                            <span className="font-mono text-[9px] text-gold/80">
                              {formatBonuses(entry.bonuses)}
                            </span>
                          </div>
                          <p className="mt-1 leading-4 text-muted">{entry.description}</p>
                          <div className="mt-1 text-[9px] leading-4 text-faint">
                            {entry.traits.map((trait) => trait.name).join(" · ")}
                            {entry.traits.some((trait) => trait.effects?.length)
                              ? ` · ${entry.traits.flatMap((trait) => effectsSummary(trait.effects)).join(", ")}`
                              : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep.id === "class" ? (
                <div className="space-y-5">
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
                            {entry.role} · {entry.complexity} · d{entry.hitDie}
                          </div>
                          <p className="mt-2 text-[11px] leading-5 text-muted">{entry.description}</p>
                          <div className="mt-2 text-[10px] leading-4 text-faint">{entry.playstyle}</div>
                          <div className="mt-3 space-y-1 border-t border-line-soft pt-2 text-[10px] leading-4 text-faint">
                            <div>
                              {entry.focusName} ·{" "}
                              {entry.primaryAttributes.map((key) => ATTR_LABELS[key]).join(" / ")}
                            </div>
                            <div>Saves: {entry.savingThrows.map((key) => ATTR_LABELS[key]).join(", ")}</div>
                            <div>Abilities: {entry.startingAbilityIds.length} at level 1</div>
                            <div>Subclass at level {entry.subclassLevel}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="kicker">Specialty</span>
                        <span className="chip">level 1</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {characterClass.specialties.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={cn(
                              "w-full border px-3 py-2 text-left text-[11px]",
                              specialty?.id === entry.id
                                ? "border-gold/50 bg-gold/[0.05] text-parchment"
                                : "border-line-soft text-parchment-dim hover:border-line",
                            )}
                            onClick={() => setSpecialtyId(entry.id)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-display text-sm">{entry.name}</span>
                              {specialty?.id === entry.id ? <Check className="size-3.5 text-gold" /> : null}
                            </div>
                            <p className="mt-0.5 leading-4 text-muted">{entry.description}</p>
                            <div className="mt-1 text-[9px] text-gold/70">
                              {effectsSummary(entry.effects).join(", ")}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="kicker">Starting kit</span>
                        <span className="chip">{characterClass.startingKits.length} options</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {characterClass.startingKits.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={cn(
                              "w-full border px-3 py-2 text-left text-[11px]",
                              kit?.id === entry.id
                                ? "border-gold/50 bg-gold/[0.05] text-parchment"
                                : "border-line-soft text-parchment-dim hover:border-line",
                            )}
                            onClick={() => setKitId(entry.id)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-display text-sm">{entry.name}</span>
                              {kit?.id === entry.id ? <Check className="size-3.5 text-gold" /> : null}
                            </div>
                            <p className="mt-0.5 leading-4 text-muted">{entry.description}</p>
                            <div className="mt-1 text-[9px] text-faint">
                              {entry.itemIds.map((id) => getItem(id)?.name ?? id).join(" · ")}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border border-line-soft bg-black/10 p-3">
                    <span className="kicker">Future path</span>
                    <p className="mt-1 text-[10px] leading-5 text-muted">
                      At level {characterClass.subclassLevel} you choose a subclass
                      {subclassPreview.length > 0
                        ? `: ${subclassPreview.map((entry) => entry.name).join(" or ")}`
                        : "."}
                      . Talents unlock at every level, with 1 starting point now.
                    </p>
                  </div>
                </div>
              ) : null}

              {currentStep.id === "background" ? (
                <div className="space-y-5">
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
                            <div>
                              Tools:{" "}
                              {entry.toolProficiencyIds.length
                                ? entry.toolProficiencyIds.map(toolName).join(", ")
                                : entry.toolOrLanguage}
                            </div>
                            <div>
                              Languages:{" "}
                              {entry.languageIds.length
                                ? entry.languageIds.map(languageName).join(", ")
                                : "—"}
                            </div>
                            <div>
                              Start: {entry.startingItemIds.map((id) => getItem(id)?.name ?? id).join(" + ")}
                            </div>
                            <div className="text-gold/70">
                              {effectsSummary(entry.originEffects).join(", ")}
                            </div>
                            <div className="text-parchment-dim">{entry.hook}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
                                {heritage?.bonuses[key]
                                  ? ` · ${formatModifier(heritage.bonuses[key]!)} heritage`
                                  : ""}
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
                                onChange={(event) =>
                                  setPoolValue(key, Number(event.target.value), STANDARD_ARRAY)
                                }
                              >
                                {STANDARD_ARRAY.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                className="input w-24"
                                value={baseAttributes[key]}
                                onChange={(event) =>
                                  setPoolValue(key, Number(event.target.value), rolledValues ?? [])
                                }
                              >
                                {(rolledValues ?? []).map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            )}
                            <span className="text-[9px] text-faint">base</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[10px] leading-5 text-faint">
                    Ancestry and heritage bonuses apply on top of the base score. Point buy uses 27 points on
                    an 8–15 scale. Rolled scores use 4d6 drop lowest and can be assigned manually.
                  </p>
                </div>
              ) : null}

              {currentStep.id === "skills" ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="kicker">Granted by origin</span>
                      <span className="chip">automatic</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {backgroundSkills.map((id) => (
                        <span key={`bg-${id}`} className="chip border-moss/30 text-[#c6d1a4]">
                          <Check className="size-3" />
                          {skillName(id)} · background
                        </span>
                      ))}
                      {ancestrySkillIds.map((id) => (
                        <span key={`anc-${id}`} className="chip border-moss/30 text-[#c6d1a4]">
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

                  {expertiseLimit > 0 ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="kicker">Expertise</span>
                        <span className="chip">
                          {expertisePicks.length}/{expertiseLimit}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-faint">
                        Expertise doubles your proficiency bonus in the chosen skills.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {expertiseEligible.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className={cn(
                              "chip",
                              expertisePicks.includes(id)
                                ? "border-gold/50 text-gold-bright"
                                : "hover:border-line",
                            )}
                            onClick={() => toggleExpertise(id)}
                          >
                            {expertisePicks.includes(id) ? <Check className="size-3" /> : null}
                            {skillName(id)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border border-line-soft bg-black/10 p-3">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-faint">
                        <Backpack className="size-3 text-gold/60" />
                        Tools
                      </div>
                      <div className="mt-2 text-[10px] leading-4 text-parchment-dim">
                        {backgroundTools.length ? backgroundTools.map(toolName).join(", ") : "None"}
                      </div>
                    </div>
                    <div className="border border-line-soft bg-black/10 p-3">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-faint">
                        <Languages className="size-3 text-gold/60" />
                        Languages
                      </div>
                      <div className="mt-2 text-[10px] leading-4 text-parchment-dim">
                        {[...backgroundLanguages, ...(extraLanguageId ? [extraLanguageId] : [])]
                          .map(languageName)
                          .join(", ") || "Common only"}
                      </div>
                      <select
                        className="input mt-2 w-full"
                        value={extraLanguageId}
                        onChange={(event) => setExtraLanguageId(event.target.value)}
                      >
                        <option value="">No extra language</option>
                        {LANGUAGES.filter((entry) => !backgroundLanguages.includes(entry.id)).map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep.id === "talents" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="kicker">Starting talent</span>
                    <span className="chip">
                      {talentNodeIds.length}/{Math.min(1, totalTalentPoints(1))} point spent
                    </span>
                  </div>
                  <p className="text-[10px] leading-5 text-faint">
                    Each class has a discipline tree. You begin with 1 talent point and gain another each
                    level. Tier 1 nodes are available now; deeper nodes unlock at levels 4 and 8.
                  </p>
                  {talentOptions.length === 0 ? (
                    <div className="border border-line-soft bg-black/10 p-3 text-[11px] text-faint">
                      This class has no starting talent options.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Array.from(new Set(talentOptions.map((node) => node.branch))).map((branch) => (
                        <div key={branch}>
                          <div className="flex items-center gap-2">
                            <GitBranch className="size-3 text-gold/60" />
                            <span className="text-[10px] uppercase tracking-[0.12em] text-parchment-dim">
                              {branch}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {talentOptions
                              .filter((node) => node.branch === branch)
                              .map((node) => {
                                const selected = talentNodeIds.includes(node.id);
                                return (
                                  <button
                                    key={node.id}
                                    type="button"
                                    className={cn(
                                      "border p-3 text-left text-[11px]",
                                      selected
                                        ? "border-gold/50 bg-gold/[0.06] text-parchment"
                                        : "border-line-soft text-parchment-dim hover:border-line",
                                    )}
                                    onClick={() =>
                                      setTalentNodeIds((current) =>
                                        current.includes(node.id) ? [] : [node.id],
                                      )
                                    }
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-display text-sm">{node.name}</span>
                                      <span className="font-mono text-[9px] text-gold/70">
                                        {node.cost} pt
                                      </span>
                                    </div>
                                    <p className="mt-1 leading-4 text-muted">{node.description}</p>
                                    <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-faint">
                                      {node.abilityIds.map((id) => (
                                        <span key={id} className="chip text-[8px]">
                                          {getAbility(id)?.name ?? id}
                                        </span>
                                      ))}
                                      {node.effects.map((effect) => (
                                        <span
                                          key={`${node.id}-${JSON.stringify(effect)}`}
                                          className="chip text-[8px]"
                                        >
                                          {effectLabel(effect)}
                                        </span>
                                      ))}
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedTalent ? (
                    <div className="border border-gold/30 bg-gold/[0.04] p-3 text-[10px] leading-4 text-muted">
                      <span className="text-parchment-dim">{selectedTalent.name}</span> selected. Deeper nodes
                      in this branch require level {Math.max(4, selectedTalent.level)} and the prerequisite
                      node.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {currentStep.id === "appearance" ? (
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  <Portrait
                    appearance={appearance}
                    ancestryId={ancestryId}
                    heritageId={heritage?.id}
                    className="w-full rounded-sm border border-line"
                  />
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
                    <p className="mt-4 text-[10px] leading-5 text-faint">
                      Portraits layer ancestry features on top of the procedural face. Heritage shapes ears,
                      tusks, horns, and the palette, so the same seed reads differently across lineages.
                    </p>
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
                    <Portrait
                      appearance={appearance}
                      ancestryId={ancestryId}
                      heritageId={heritage?.id}
                      className="w-full rounded-sm border border-line"
                    />
                    <div>
                      <div className="font-display text-3xl text-parchment">
                        {name.trim() || "Unnamed Wanderer"}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-gold/80">
                        {ancestry.name} · {heritage?.name ?? "No heritage"} · {characterClass.name} ·{" "}
                        {specialty?.name ?? "No specialty"} · {background.name}
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-muted">{background.hook}</p>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <DerivedStat label="HP" value={preview?.hp.max ?? "—"} />
                        <DerivedStat label="AC" value={preview?.ac ?? "—"} />
                        <DerivedStat label={characterClass.focusName} value={preview?.focus.max ?? "—"} />
                        <DerivedStat label="Speed" value={preview?.speed ?? "—"} />
                        <DerivedStat label="Proficiency" value={`+${proficiencyBonus(1)}`} />
                        <DerivedStat
                          label="Initiative"
                          value={formatModifier(abilityModifier(finalBase.dex))}
                        />
                        <DerivedStat
                          label="Passive Perception"
                          value={preview ? passiveScore(preview, "perception") : "—"}
                        />
                        <DerivedStat label="Subclass at" value={`level ${characterClass.subclassLevel}`} />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="border border-line-soft bg-black/10 p-3">
                      <span className="kicker">Skills</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {finalSkillIds.map((id) => (
                          <span
                            key={id}
                            className={cn(
                              "chip text-[9px]",
                              expertisePicks.includes(id) && "border-gold/40 text-gold-bright",
                            )}
                          >
                            {skillName(id)}
                            {expertisePicks.includes(id) ? " · expertise" : ""}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-[9px] leading-4 text-faint">
                        Tools: {backgroundTools.length ? backgroundTools.map(toolName).join(", ") : "none"} ·
                        Languages:{" "}
                        {[...backgroundLanguages, ...(extraLanguageId ? [extraLanguageId] : [])]
                          .map(languageName)
                          .join(", ") || "Common"}
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

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="border border-line-soft bg-black/10 p-3">
                      <span className="kicker">Abilities</span>
                      <div className="mt-2 space-y-1.5">
                        {preview?.abilityIds.map((id) => {
                          const ability = getAbility(id);
                          return (
                            <div key={id} className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="text-parchment-dim">{ability?.name ?? id}</span>
                              <span className="font-mono text-[9px] text-faint">
                                {ability?.cost ?? 0} {characterClass.focusName.toLowerCase()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="border border-line-soft bg-black/10 p-3">
                      <span className="kicker">First talent</span>
                      <div className="mt-2 text-[11px] text-parchment-dim">
                        {selectedTalent?.name ?? "None"}
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted">{selectedTalent?.description}</p>
                      <div className="mt-2 text-[9px] text-gold/70">
                        {selectedTalent ? effectsSummary([...selectedTalent.effects]).join(", ") : ""}
                        {selectedTalent?.abilityIds.length
                          ? selectedTalent.abilityIds.map((id) => getAbility(id)?.name ?? id).join(", ")
                          : ""}
                      </div>
                    </div>
                  </div>

                  {subclassPreview.length > 0 ? (
                    <div className="border border-line-soft bg-black/10 p-3">
                      <span className="kicker">Future path</span>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {subclassPreview.map((entry) => (
                          <div key={entry.id} className="border border-line-soft/70 px-2.5 py-2">
                            <div className="font-display text-sm text-parchment">{entry.name}</div>
                            <p className="mt-0.5 text-[10px] leading-4 text-muted">{entry.description}</p>
                            <div className="mt-1 text-[9px] text-faint">
                              {entry.features
                                .map((feature) => `${feature.level}: ${feature.name}`)
                                .join(" · ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {validationErrors.length > 0 ? (
                    <div className="border border-blood/40 bg-blood/10 px-3 py-2 text-[10px] leading-4 text-[#e0b0aa]">
                      {validationErrors.join(" ")}
                    </div>
                  ) : null}
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
            <Portrait
              appearance={appearance}
              ancestryId={ancestryId}
              heritageId={heritage?.id}
              className="mt-3 w-full rounded-sm border border-line"
            />
            <div className="mt-3">
              <div className="font-display text-xl text-parchment">{name.trim() || "Unnamed Wanderer"}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-faint">
                {ancestry.name} · {characterClass.name}
              </div>
              <div className="mt-0.5 text-[9px] text-gold/70">
                {heritage?.name ?? "No heritage"} · {specialty?.name ?? "No specialty"}
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
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-faint">Kit</span>
                <span className="text-parchment-dim">{kit?.name ?? "Class default"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Talent</span>
                <span className="text-parchment-dim">{selectedTalent?.name ?? "Unspent"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Skills</span>
                <span className="text-parchment-dim">{finalSkillIds.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Talent points</span>
                <span className="text-parchment-dim">
                  {Math.max(0, totalTalentPoints(1) - (selectedTalent?.cost ?? 0))}
                </span>
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
    case "talents":
      return "The first discipline";
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
