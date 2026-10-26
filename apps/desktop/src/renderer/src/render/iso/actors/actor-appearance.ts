import { getPalette } from "@iwakura/content";
import { hashString } from "@iwakura/engine";
import type {
  ActorAppearance,
  ActorAppearanceInput,
  ActorArchetype,
  ActorBody,
  ActorFacing,
  ActorOffhand,
  ActorWeapon,
} from "./actor-types";

const FACINGS: readonly ActorFacing[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

const ENGINE_FACING: readonly ActorFacing[] = ["e", "ne", "nw", "w", "sw", "se"];

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function archetypeFromInput(input: ActorAppearanceInput, body: ActorBody): ActorArchetype {
  if (body === "wolf") return "wolf";
  if (body === "shade") return "shade";

  const text = [input.id, input.name, input.role, input.archetype, input.classId, input.enemyId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(text, ["bandit", "brigand", "raider"])) return "bandit";
  if (includesAny(text, ["fighter", "warrior", "soldier"])) return "fighter";
  if (includesAny(text, ["rogue", "thief", "scout"])) return "rogue";
  if (includesAny(text, ["wizard", "mage", "sorcerer", "spell"])) return "wizard";
  if (includesAny(text, ["captain", "guard", "watch", "sentinel"])) return "guard";
  if (includesAny(text, ["merchant", "trader", "shopkeeper"])) return "merchant";
  if (includesAny(text, ["clergy", "priest", "sister", "keeper", "chapel", "temple"])) return "clergy";
  if (includesAny(text, ["fieldhand", "farmer", "miller", "laborer", "field"])) return "fieldhand";
  if (includesAny(text, ["outlaw", "charcoal", "hunter", "woodsman", "ranger"])) return "outlaw";
  if (includesAny(text, ["guard", "watch"])) return "guard";
  return "civilian";
}

function bodyFromInput(input: ActorAppearanceInput): ActorBody {
  const tags = input.tags?.join(" ").toLowerCase() ?? "";
  const text = [input.id, input.name, input.role, input.archetype, input.enemyId, tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(text, ["wolf", "hound", "beast"])) return "wolf";
  if (includesAny(text, ["shade", "wraith", "spirit", "ghost", "undead"])) return "shade";

  const ancestry = input.ancestryId?.toLowerCase() ?? "";
  if (ancestry.includes("dwarf")) return "dwarf";
  if (ancestry.includes("elf")) return "elf";
  return "human";
}

function weaponFromInput(input: ActorAppearanceInput, archetype: ActorArchetype): ActorWeapon {
  if (archetype === "wolf") return "bite";
  if (archetype === "shade") return "spectral";

  const mainHand = input.mainHand?.toLowerCase() ?? "";
  if (mainHand.includes("staff")) return "staff";
  if (mainHand.includes("dagger")) return "dagger";
  if (mainHand.includes("sword")) return "sword";
  if (mainHand.includes("spear") || mainHand.includes("pike")) return "spear";
  if (mainHand.includes("axe")) return "axe";

  switch (archetype) {
    case "fighter":
      return "sword";
    case "rogue":
      return "dagger";
    case "wizard":
      return "staff";
    case "guard":
      return "spear";
    case "clergy":
      return "staff";
    case "fieldhand":
      return "pitchfork";
    case "outlaw":
    case "bandit":
      return "axe";
    default:
      return "none";
  }
}

function offhandFromInput(
  input: ActorAppearanceInput,
  archetype: ActorArchetype,
  weapon: ActorWeapon,
): ActorOffhand {
  if (weapon === "bite" || weapon === "spectral") return "none";
  if (archetype === "fighter" || archetype === "guard") return "shield";
  if (archetype === "rogue" && (input.seed?.length ?? 0) % 2 === 0) return "dagger";
  if (input.offHand?.toLowerCase().includes("shield")) return "shield";
  return "none";
}

/**
 * Resolve the many content-side descriptions of a character into a stable
 * visual archetype. This is deliberately cosmetic: names, roles, tags, and
 * equipment only choose a silhouette and never alter combat or saves.
 */
export function resolveActorAppearance(input: ActorAppearanceInput): ActorAppearance {
  const body = bodyFromInput(input);
  const archetype = archetypeFromInput(input, body);
  const weapon = weaponFromInput(input, archetype);
  const seed = hashString(`${input.id}:${input.seed ?? ""}:${input.palette ?? ""}:${archetype}`);
  const palette = getPalette(input.palette ?? (archetype === "bandit" ? "ember" : "verdant"));
  const hood =
    body !== "wolf" &&
    (includesAny(archetype, ["rogue", "wizard", "outlaw", "bandit", "clergy"]) ||
      (archetype === "civilian" && seed % 5 === 0));
  const helmet =
    body !== "wolf" &&
    body !== "shade" &&
    (archetype === "guard" || (archetype === "fighter" && seed % 3 !== 0));
  const beard = body === "dwarf" || (body !== "wolf" && body !== "shade" && seed % 9 === 0);
  const cape =
    body !== "wolf" &&
    body !== "shade" &&
    (archetype === "fighter" ||
      archetype === "bandit" ||
      archetype === "outlaw" ||
      (archetype === "rogue" && seed % 2 === 0));

  return {
    seed,
    body,
    archetype,
    palette,
    weapon,
    offhand: offhandFromInput(input, archetype, weapon),
    hood,
    helmet,
    beard,
    cape,
    hairStyle: seed % 4,
    scale:
      body === "dwarf" ? 1.08 : body === "elf" ? 1.2 : body === "wolf" ? 1.1 : body === "shade" ? 1.16 : 1.18,
    sigil: input.sigil ?? "hex",
  };
}

export function facingFromVector(dx: number, dy: number, fallback: ActorFacing = "s"): ActorFacing {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;
  const index = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return FACINGS[index] ?? fallback;
}

export function engineFacingToActorFacing(facing: number): ActorFacing {
  return ENGINE_FACING[((facing % 6) + 6) % 6] ?? "s";
}

export function facingVector(facing: ActorFacing): { x: number; y: number } {
  switch (facing) {
    case "e":
      return { x: 1, y: 0 };
    case "se":
      return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    case "s":
      return { x: 0, y: 1 };
    case "sw":
      return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    case "w":
      return { x: -1, y: 0 };
    case "nw":
      return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    case "n":
      return { x: 0, y: -1 };
    case "ne":
      return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
  }
}

export function facingToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fallback: ActorFacing = "s",
): ActorFacing {
  return facingFromVector(to.x - from.x, to.y - from.y, fallback);
}

export function facingIsBack(facing: ActorFacing): boolean {
  return facing === "n" || facing === "ne" || facing === "nw";
}

export function facingIsLeft(facing: ActorFacing): boolean {
  return facing === "w" || facing === "sw" || facing === "nw";
}

export function facingIsRight(facing: ActorFacing): boolean {
  return facing === "e" || facing === "se" || facing === "ne";
}

export function facingIsSide(facing: ActorFacing): boolean {
  return facing === "e" || facing === "w";
}

export function facingIsFront(facing: ActorFacing): boolean {
  return facing === "s" || facing === "se" || facing === "sw";
}
