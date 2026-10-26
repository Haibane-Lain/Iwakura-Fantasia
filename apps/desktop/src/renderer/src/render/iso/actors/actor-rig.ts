import { Container, Graphics } from "pixi.js";
import type { ActorAppearance } from "./actor-types";

const INK = 0x0b0907;
const BOOT = 0x2c251f;
const METAL = 0x8c8b82;
const METAL_DARK = 0x4c504b;
const LEATHER_COLOR = 0x6d4a32;

function color(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shade(value: number, amount: number): number {
  const r = Math.max(0, Math.min(255, ((value >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (value & 0xff) + amount));
  return (r << 16) | (g << 8) | b;
}

function addLimb(
  parent: Container,
  x: number,
  y: number,
  colorValue: number,
  skinValue: number,
  length: number,
  width: number,
): Container {
  const limb = new Container();
  limb.position.set(x, y);
  const shape = new Graphics();
  shape
    .poly([-width / 2, 0, width / 2, 0, width / 2 - 0.8, length, -width / 2 + 0.8, length], true)
    .fill(colorValue)
    .stroke({ color: INK, width: 1 });
  limb.addChild(shape);
  const hand = new Graphics();
  hand
    .circle(0, length + 0.6, width * 0.47)
    .fill(skinValue)
    .stroke({ color: INK, width: 0.8 });
  limb.addChild(hand);
  parent.addChild(limb);
  return limb;
}

function drawSigil(
  graphics: Graphics,
  sigil: string,
  x: number,
  y: number,
  size: number,
  colorValue: number,
): void {
  const stroke = { color: colorValue, width: 0.9, alpha: 0.95 };
  switch (sigil) {
    case "flame":
      graphics
        .poly(
          [x, y - size, x + size * 0.7, y + size * 0.2, x, y + size, x - size * 0.7, y + size * 0.2],
          true,
        )
        .fill({ color: colorValue, alpha: 0.85 });
      break;
    case "leaf":
      graphics
        .ellipse(x, y, size * 0.7, size)
        .fill({ color: colorValue, alpha: 0.8 })
        .moveTo(x, y + size)
        .lineTo(x + size * 0.4, y - size)
        .stroke(stroke);
      break;
    case "eye":
      graphics
        .ellipse(x, y, size, size * 0.55)
        .stroke(stroke)
        .circle(x, y, size * 0.28)
        .fill({ color: colorValue, alpha: 0.95 });
      break;
    case "sword":
      graphics
        .moveTo(x, y - size)
        .lineTo(x, y + size)
        .moveTo(x - size * 0.65, y + size * 0.25)
        .lineTo(x + size * 0.65, y + size * 0.25)
        .stroke(stroke);
      break;
    case "moon":
      graphics
        .poly(
          [x + size * 0.2, y - size, x - size * 0.7, y, x + size * 0.2, y + size, x - size * 0.15, y],
          true,
        )
        .fill({ color: colorValue, alpha: 0.85 });
      break;
    default:
      graphics
        .poly(
          [
            x,
            y - size,
            x + size * 0.82,
            y - size * 0.35,
            x + size * 0.7,
            y + size * 0.6,
            x,
            y + size,
            x - size * 0.7,
            y + size * 0.6,
            x - size * 0.82,
            y - size * 0.35,
          ],
          true,
        )
        .fill({ color: colorValue, alpha: 0.82 })
        .stroke(stroke);
  }
}

function drawWeapon(appearance: ActorAppearance, container: Container): void {
  const g = new Graphics();
  const blade = shade(color(appearance.palette.trim, 0xc9a35a), 36);
  const wood = 0x5a3f27;
  const glow = color(appearance.palette.glow, 0x9fbf7a);
  switch (appearance.weapon) {
    case "sword":
      g.poly([-1.4, -17, 1.4, -17, 1.1, -2, -1.1, -2], true).fill(blade).stroke({ color: INK, width: 0.8 });
      g.moveTo(-4.2, -2.3).lineTo(4.2, -2.3).stroke({ color: METAL_DARK, width: 1.5 });
      g.moveTo(0, -2).lineTo(0, 2).stroke({ color: 0x3b2a20, width: 1.8 });
      g.moveTo(-1.2, -9).lineTo(1.2, -12).stroke({ color: 0xf1e5bf, width: 0.7, alpha: 0.8 });
      break;
    case "dagger":
      g.poly([-1.1, -10, 1.1, -10, 0.8, -1, -0.8, -1], true).fill(blade).stroke({ color: INK, width: 0.7 });
      g.moveTo(-2.6, -1.2).lineTo(2.6, -1.2).stroke({ color: METAL_DARK, width: 1.3 });
      g.moveTo(0, -1).lineTo(0, 1.5).stroke({ color: 0x3b2a20, width: 1.5 });
      break;
    case "staff":
      g.moveTo(0, 9).lineTo(0, -21).stroke({ color: wood, width: 2.2 });
      g.circle(0, -22, 3)
        .fill({ color: glow, alpha: 0.82 })
        .stroke({ color: shade(glow, -45), width: 0.8 });
      g.circle(0, -22, 1.2).fill({ color: 0xf4edcd, alpha: 0.9 });
      break;
    case "spear":
      g.moveTo(0, 11).lineTo(0, -22).stroke({ color: wood, width: 1.7 });
      g.poly([0, -29, 3.4, -21, 0, -19, -3.4, -21], true).fill(blade).stroke({ color: INK, width: 0.7 });
      break;
    case "axe":
      g.moveTo(0, 9).lineTo(0, -17).stroke({ color: wood, width: 2 });
      g.poly([0, -19, 7, -15, 8, -7, 1, -10], true).fill(blade).stroke({ color: INK, width: 0.8 });
      g.moveTo(0, -16).lineTo(4, -13).stroke({ color: 0xe8dcc0, width: 0.7, alpha: 0.6 });
      break;
    case "pitchfork":
      g.moveTo(0, 11).lineTo(0, -22).stroke({ color: wood, width: 1.6 });
      for (const offset of [-3, 0, 3]) {
        g.moveTo(offset, -22)
          .lineTo(offset * 1.1, -29)
          .stroke({ color: METAL, width: 0.9 });
      }
      break;
    case "spectral":
      g.moveTo(0, 5)
        .lineTo(2, -4)
        .lineTo(-1, -12)
        .lineTo(4, -21)
        .stroke({ color: glow, width: 1.6, alpha: 0.9 });
      g.circle(4, -22, 2.2).fill({ color: glow, alpha: 0.45 });
      break;
    case "bite":
    case "none":
      break;
  }
  container.addChild(g);
}

export interface HumanoidParts {
  kind: "humanoid";
  body: Container;
  cloak: Container;
  legLeft: Container;
  legRight: Container;
  torso: Container;
  armBack: Container;
  armFront: Container;
  head: Container;
  face: Graphics;
  faceSide: Graphics;
  backHead: Graphics;
  hood: Graphics | null;
  helmet: Graphics | null;
  beard: Graphics | null;
  sigil: Graphics;
  accessories: Graphics;
  weapon: Container;
  weaponRestRotation: number;
  shield: Graphics | null;
}

export interface BeastParts {
  kind: "beast";
  body: Container;
  head: Container;
  tail: Container;
  legs: Container[];
  jaw: Graphics;
}

export interface SpiritParts {
  kind: "spirit";
  body: Container;
  head: Container;
  armLeft: Container;
  armRight: Container;
  strips: Container[];
  core: Graphics;
}

export type ActorRigParts = HumanoidParts | BeastParts | SpiritParts;

function buildHumanoid(appearance: ActorAppearance): HumanoidParts {
  const cloakColor = color(appearance.palette.cloak, 0x3f5538);
  const trim = color(appearance.palette.trim, 0xc9a35a);
  const skin = color(appearance.palette.skin, 0xc9a07a);
  const ink = color(appearance.palette.ink, INK);
  const glow = color(appearance.palette.glow, trim);
  const clothDark = shade(cloakColor, -24);
  const clothLight = shade(cloakColor, 15);
  const hair = shade(cloakColor, -42);
  const width = appearance.body === "dwarf" ? 8.4 : appearance.body === "elf" ? 6.2 : 7.2;
  const robe = appearance.archetype === "wizard" || appearance.archetype === "clergy";
  const body = new Container();

  const cloak = new Container();
  cloak.position.set(0, -29);
  const cloakShape = new Graphics();
  cloakShape
    .poly(
      [
        -width - 0.5,
        0,
        -width - 1.8,
        12,
        -width + 1.4,
        17,
        0,
        13.5,
        width - 1.4,
        17,
        width + 1.8,
        12,
        width + 0.5,
        0,
      ],
      true,
    )
    .fill({ color: clothDark, alpha: 0.96 })
    .stroke({ color: ink, width: 1 });
  cloakShape
    .moveTo(-width + 1, 13)
    .lineTo(0, 10.5)
    .lineTo(width - 1, 13)
    .stroke({ color: trim, width: 1, alpha: 0.55 });
  cloak.addChild(cloakShape);
  cloak.visible = appearance.cape;
  body.addChild(cloak);

  const legLeft = new Container();
  const legRight = new Container();
  legLeft.position.set(-width * 0.36, -14);
  legRight.position.set(width * 0.36, -14);
  for (const leg of [legLeft, legRight]) {
    const shape = new Graphics();
    shape
      .poly([-2.1, 0, 2.1, 0, 1.8, 9.5, -1.8, 9.5], true)
      .fill({ color: robe ? clothDark : shade(cloakColor, -18) })
      .stroke({ color: ink, width: 0.9 });
    shape.rect(-2.7, 9.1, 5.4, 3).fill({ color: BOOT }).stroke({ color: ink, width: 0.8 });
    leg.addChild(shape);
    body.addChild(leg);
  }

  const armBack = addLimb(body, -width * 0.92, -27, shade(cloakColor, -20), skin, 11, 3.4);
  const torso = new Container();
  torso.position.set(0, -14);
  const torsoShape = new Graphics();
  const robeDepth = robe ? 10 : 2.5;
  torsoShape
    .poly(
      [
        -width,
        0,
        -width * 0.82,
        -11,
        -width * 0.45,
        -14.7,
        0,
        -16,
        width * 0.45,
        -14.7,
        width * 0.82,
        -11,
        width,
        0,
        width * 0.72,
        robeDepth,
        -width * 0.7,
        robeDepth,
      ],
      true,
    )
    .fill(cloakColor)
    .stroke({ color: ink, width: 1.2 });
  torsoShape
    .poly([-width * 0.55, -11, 0, -14, width * 0.55, -11, width * 0.4, -2, 0, 0, -width * 0.4, -2], true)
    .fill({ color: clothLight, alpha: 0.38 });
  torsoShape.rect(-width, -3, width * 2, 2.2).fill({ color: trim, alpha: 0.7 });
  torsoShape.moveTo(0, -15).lineTo(0, -4).stroke({ color: trim, width: 0.8, alpha: 0.68 });

  if (appearance.archetype === "guard" || appearance.archetype === "fighter") {
    torsoShape
      .ellipse(-width * 0.86, -11, 3.4, 2.3)
      .fill({ color: shade(METAL, -18) })
      .stroke({ color: ink, width: 0.7 });
    torsoShape
      .ellipse(width * 0.86, -11, 3.4, 2.3)
      .fill({ color: shade(METAL, -18) })
      .stroke({ color: ink, width: 0.7 });
  }
  torso.addChild(torsoShape);
  const sigil = new Graphics();
  drawSigil(sigil, appearance.sigil, 0, -9.5, 2.4, trim);
  torso.addChild(sigil);

  const accessories = new Graphics();
  if (appearance.archetype === "merchant") {
    accessories
      .poly([-4.2, -10, 4.2, -10, 5, 3, -5, 3], true)
      .fill({ color: shade(trim, -12), alpha: 0.9 })
      .stroke({ color: ink, width: 0.8 });
    accessories.rect(-2.8, -4.3, 5.6, 2.8).fill({ color: shade(trim, -28), alpha: 0.9 });
    accessories
      .moveTo(-4.5, -8.5)
      .lineTo(-6.8, -7)
      .lineTo(-5.8, 1)
      .stroke({ color: LEATHER_COLOR, width: 1.3 });
    accessories.rect(-7.2, -3.5, 3, 4).fill({ color: LEATHER_COLOR }).stroke({ color: ink, width: 0.7 });
  } else if (appearance.archetype === "clergy") {
    accessories
      .poly([-3.4, -14, -1.8, -14, -2.2, 4, -3.8, 4], true)
      .fill({ color: shade(trim, 10), alpha: 0.9 });
    accessories.poly([1.8, -14, 3.4, -14, 3.8, 4, 2.2, 4], true).fill({ color: shade(trim, 10), alpha: 0.9 });
    accessories.moveTo(-5, -13).lineTo(5, -13).stroke({ color: trim, width: 1, alpha: 0.7 });
  } else if (appearance.archetype === "rogue" || appearance.archetype === "outlaw") {
    accessories.rect(4.2, -3.2, 3.2, 3.4).fill({ color: LEATHER_COLOR }).stroke({ color: ink, width: 0.6 });
    accessories
      .moveTo(4.8, -2.8)
      .lineTo(6.6, -2.8)
      .stroke({ color: shade(trim, -18), width: 0.7 });
  } else if (appearance.archetype === "guard") {
    accessories
      .poly([-2.2, -13.5, 2.2, -13.5, 1.7, 3, -1.7, 3], true)
      .fill({ color: trim, alpha: 0.78 })
      .stroke({ color: shade(trim, -38), width: 0.5 });
    accessories.rect(-4.5, -3, 9, 1.6).fill({ color: shade(trim, -24), alpha: 0.9 });
  } else if (appearance.archetype === "bandit") {
    accessories
      .ellipse(-width * 0.72, -11.8, 4, 2.4)
      .fill({ color: shade(cloakColor, -30) })
      .stroke({ color: ink, width: 0.6 });
    accessories
      .ellipse(width * 0.72, -11.8, 4, 2.4)
      .fill({ color: shade(cloakColor, -30) })
      .stroke({ color: ink, width: 0.6 });
  } else if (appearance.archetype === "wizard") {
    accessories
      .moveTo(-width + 1.5, 5)
      .lineTo(0, 7)
      .lineTo(width - 1.5, 5)
      .stroke({ color: trim, width: 1.2, alpha: 0.8 });
  }
  torso.addChild(accessories);
  body.addChild(torso);

  if (appearance.archetype === "merchant") {
    const satchel = new Graphics();
    satchel
      .poly([4.5, -7, 9, -8, 10, -2, 5.2, -1], true)
      .fill({ color: LEATHER_COLOR })
      .stroke({ color: ink, width: 0.8 });
    satchel
      .moveTo(5.2, -6.2)
      .lineTo(9.6, -7)
      .stroke({ color: shade(trim, -12), width: 0.8 });
    body.addChild(satchel);
  }

  const head = new Container();
  head.position.set(0, -31);
  const headShape = new Graphics();
  headShape
    .rect(-1.4, 3, 2.8, 3)
    .fill({ color: shade(skin, -18) })
    .stroke({ color: ink, width: 0.6 });
  headShape.circle(0, -4, 5.3).fill({ color: skin }).stroke({ color: ink, width: 1.1 });
  if (appearance.body === "elf") {
    headShape.poly([-5, -5, -8, -7, -5.1, -2], true).fill({ color: skin }).stroke({ color: ink, width: 0.6 });
    headShape.poly([5, -5, 8, -7, 5.1, -2], true).fill({ color: skin }).stroke({ color: ink, width: 0.6 });
  }
  if (appearance.hairStyle !== 3) {
    headShape
      .poly(
        appearance.hairStyle === 1
          ? [-5.5, -7, -6, 2, -4, -1, -3, -8, 0, -10, 4, -8, 6, 1, 5, 2, 4, -5]
          : [-5.5, -6, -4, -10, 0, -10.6, 4.2, -9.5, 5.5, -5, 3, -7, -1, -8],
        true,
      )
      .fill({ color: hair, alpha: 0.98 });
  }
  head.addChild(headShape);

  let hood: Graphics | null = null;
  if (appearance.hood) {
    hood = new Graphics();
    hood
      .poly([-7.4, -1, -6.8, -9, -2.5, -13, 2.5, -13, 6.8, -9, 7.4, 0, 4, 2, -4, 2], true)
      .fill({ color: clothDark })
      .stroke({ color: ink, width: 1 });
    hood
      .poly([-6.2, -3, -5.3, -9, 0, -11.8, 5.3, -9, 6.2, -3, 2, -5, -2, -5], true)
      .fill({ color: shade(cloakColor, -12), alpha: 0.95 });
    head.addChildAt(hood, 1);
  }

  let helmet: Graphics | null = null;
  if (appearance.helmet && !appearance.hood) {
    helmet = new Graphics();
    helmet
      .poly([-5.7, -7, -4.8, -11, 0, -12, 4.8, -11, 5.7, -7, 3.5, -6, 0, -7.8, -3.5, -6], true)
      .fill({ color: METAL })
      .stroke({ color: ink, width: 0.9 });
    helmet.rect(-0.8, -8, 1.6, 5).fill({ color: METAL_DARK }).stroke({ color: ink, width: 0.5 });
    head.addChild(helmet);
  }

  const face = new Graphics();
  face.circle(-1.9, -4.6, 0.7).fill({ color: ink });
  face.circle(1.9, -4.6, 0.7).fill({ color: ink });
  face
    .moveTo(-1, -2.3)
    .quadraticCurveTo(0, -1.7, 1, -2.3)
    .stroke({ color: shade(skin, -35), width: 0.6 });
  if (appearance.archetype === "bandit") {
    face
      .poly([-4.8, -3.2, 4.8, -3.2, 3.8, 1.2, -3.8, 1.2], true)
      .fill({ color: clothDark, alpha: 0.96 })
      .stroke({ color: ink, width: 0.6 });
  }
  head.addChild(face);

  const faceSide = new Graphics();
  faceSide.circle(2.1, -4.6, 0.78).fill({ color: ink });
  faceSide
    .moveTo(3.4, -4)
    .lineTo(5.1, -3)
    .lineTo(3.6, -2.2)
    .stroke({ color: shade(skin, -28), width: 0.7 });
  faceSide
    .moveTo(2.2, -1.8)
    .quadraticCurveTo(3.2, -1.4, 3.9, -1.9)
    .stroke({ color: shade(skin, -35), width: 0.6 });
  faceSide.visible = false;
  head.addChild(faceSide);

  const backHead = new Graphics();
  backHead
    .circle(0, -4, 5.35)
    .fill({ color: appearance.hood ? clothDark : appearance.helmet ? METAL_DARK : hair })
    .stroke({ color: ink, width: 1 });
  if (appearance.hairStyle === 1) {
    backHead.poly([-4, -8, -5.5, 2, 0, 5, 5.5, 2, 4, -8], true).fill({ color: hair });
  }
  backHead.visible = false;
  head.addChild(backHead);

  let beard: Graphics | null = null;
  if (appearance.beard) {
    beard = new Graphics();
    beard
      .poly([-4.6, -2, -2, 5, 0, 6.5, 2.5, 4.7, 4.6, -2, 2, 0, 0, 1.5, -2, 0], true)
      .fill({ color: shade(hair, 8) })
      .stroke({ color: ink, width: 0.7 });
    head.addChild(beard);
  }

  if (appearance.archetype === "fieldhand") {
    const hat = new Graphics();
    hat
      .ellipse(0, -7.5, 8.4, 2.4)
      .fill({ color: shade(trim, 12) })
      .stroke({ color: ink, width: 0.7 });
    hat
      .poly([-5, -8, -4, -13, 4, -13, 5, -8], true)
      .fill({ color: shade(trim, 22) })
      .stroke({ color: ink, width: 0.7 });
    hat.rect(-4.3, -10.2, 8.6, 1.2).fill({ color: shade(trim, -35), alpha: 0.9 });
    head.addChild(hat);
  } else if (appearance.archetype === "wizard") {
    const hat = new Graphics();
    hat.ellipse(0, -7, 8.6, 2.6).fill({ color: clothDark }).stroke({ color: ink, width: 0.8 });
    hat
      .poly([-5.5, -7, -1.2, -20, 0.2, -23, 2.8, -19, 5.5, -7], true)
      .fill({ color: cloakColor })
      .stroke({ color: ink, width: 0.9 });
    hat.moveTo(-3.5, -9).lineTo(3.4, -9).stroke({ color: trim, width: 1, alpha: 0.85 });
    hat.circle(0.4, -16.5, 0.8).fill({ color: glow, alpha: 0.9 });
    head.addChild(hat);
  } else if (appearance.archetype === "merchant") {
    const cap = new Graphics();
    cap
      .ellipse(0, -7.2, 6.2, 2)
      .fill({ color: shade(trim, -20) })
      .stroke({ color: ink, width: 0.6 });
    cap
      .poly([-4.2, -7.4, -3.4, -11.4, 3.4, -11.4, 4.2, -7.4], true)
      .fill({ color: shade(trim, -10) })
      .stroke({ color: ink, width: 0.7 });
    head.addChild(cap);
  }
  body.addChild(head);

  const armFront = addLimb(body, width * 0.92, -27, cloakColor, skin, 11, 3.4);
  const weapon = new Container();
  const weaponRestRotation =
    appearance.weapon === "sword"
      ? 0.5
      : appearance.weapon === "dagger"
        ? 0.42
        : appearance.weapon === "axe"
          ? 0.34
          : appearance.weapon === "staff"
            ? 0.12
            : 0.16;
  weapon.position.set(appearance.weapon === "sword" ? 1.8 : 0.9, 10);
  weapon.rotation = weaponRestRotation;
  drawWeapon(appearance, weapon);
  armFront.addChild(weapon);

  let shield: Graphics | null = null;
  if (appearance.offhand === "shield") {
    shield = new Graphics();
    shield
      .poly([-6, -9, 5, -9, 7, -1, 0, 9, -7, -1], true)
      .fill({ color: shade(cloakColor, -16) })
      .stroke({ color: ink, width: 1 });
    shield
      .poly([-3.8, -6, 3.2, -6, 4.4, -1, 0, 4.6, -4.4, -1], true)
      .stroke({ color: trim, width: 1.1, alpha: 0.9 });
    shield.circle(0, -1, 1.5).fill({ color: glow, alpha: 0.8 });
    shield.position.set(-1, 8);
    armBack.addChild(shield);
  } else if (appearance.offhand === "dagger") {
    const offhand = new Graphics();
    offhand
      .poly([-0.8, -8, 0.8, -8, 0.5, -1, -0.5, -1], true)
      .fill({ color: shade(trim, 25) })
      .stroke({ color: ink, width: 0.6 });
    offhand.position.set(0, 9);
    armBack.addChild(offhand);
  }

  body.addChild(fxPlaceholder());
  return {
    kind: "humanoid",
    body,
    cloak,
    legLeft,
    legRight,
    torso,
    armBack,
    armFront,
    head,
    face,
    faceSide,
    backHead,
    hood,
    helmet,
    beard,
    sigil,
    accessories,
    weapon,
    weaponRestRotation,
    shield,
  };
}

/** A lightweight transparent holder keeps the part order stable for ActorView. */
function fxPlaceholder(): Container {
  const container = new Container();
  container.label = "actor-fx-anchor";
  return container;
}

function buildBeast(appearance: ActorAppearance): BeastParts {
  const fur = color(appearance.palette.cloak, 0x4e5147);
  const mane = color(appearance.palette.trim, 0x8e8b72);
  const eye = color(appearance.palette.glow, 0xd2b06a);
  const body = new Container();

  const tail = new Container();
  tail.position.set(-10, -17);
  const tailShape = new Graphics();
  tailShape
    .moveTo(0, 0)
    .quadraticCurveTo(-8, -7, -12, 4)
    .stroke({ color: fur, width: 3.2 })
    .moveTo(-12, 4)
    .lineTo(-15, 8)
    .stroke({ color: shade(fur, -24), width: 2.4 });
  tail.addChild(tailShape);
  body.addChild(tail);

  const legs: Container[] = [];
  for (const [index, offset] of [-8, -3.2, 3.2, 8].entries()) {
    const leg = new Container();
    leg.position.set(offset, -10);
    const shape = new Graphics();
    shape
      .poly([-1.6, 0, 1.6, 0, 1.2, 9, -1.2, 9], true)
      .fill({ color: shade(fur, index % 2 === 0 ? -14 : -4) })
      .stroke({ color: INK, width: 0.7 });
    shape.rect(-2.1, 8.3, 4.2, 2.2).fill({ color: shade(fur, -30) });
    leg.addChild(shape);
    body.addChild(leg);
    legs.push(leg);
  }

  const torso = new Graphics();
  torso.ellipse(0, -17, 16, 9.6).fill({ color: fur }).stroke({ color: INK, width: 1.1 });
  torso.moveTo(-11, -22).quadraticCurveTo(0, -27, 12, -22).stroke({ color: mane, width: 2.4, alpha: 0.8 });
  body.addChild(torso);

  const head = new Container();
  head.position.set(11, -22);
  const headShape = new Graphics();
  headShape
    .ellipse(0, 0, 7, 5.4)
    .fill({ color: shade(fur, 6) })
    .stroke({ color: INK, width: 1 });
  headShape
    .poly([-4, -4, -1, -10, 2, -4], true)
    .fill({ color: shade(fur, -8) })
    .stroke({ color: INK, width: 0.8 });
  headShape
    .poly([3, -4, 6, -9, 8, -3], true)
    .fill({ color: shade(fur, -8) })
    .stroke({ color: INK, width: 0.8 });
  headShape
    .poly([4, 0, 11, 1, 9, 4, 3, 4], true)
    .fill({ color: shade(fur, 10) })
    .stroke({ color: INK, width: 0.8 });
  headShape.circle(3.2, -2, 1.2).fill({ color: eye });
  headShape.circle(3.5, -2, 0.55).fill({ color: INK });
  headShape.moveTo(9, 3).lineTo(10, 5.2).stroke({ color: INK, width: 0.8 });
  head.addChild(headShape);
  const jaw = new Graphics();
  jaw
    .poly([4, 3, 10, 3, 9, 6, 5, 6], true)
    .fill({ color: shade(fur, -18) })
    .stroke({ color: INK, width: 0.7 });
  head.addChild(jaw);
  body.addChild(head);

  body.addChild(fxPlaceholder());
  return { kind: "beast", body, head, tail, legs, jaw };
}

function buildSpirit(appearance: ActorAppearance): SpiritParts {
  const robe = color(appearance.palette.cloak, 0x2a2a36);
  const glow = color(appearance.palette.glow, 0x8d84b8);
  const ink = color(appearance.palette.ink, INK);
  const body = new Container();

  const strips: Container[] = [];
  for (const [index, offset] of [-9, -4.5, 0, 4.5, 9].entries()) {
    const strip = new Container();
    strip.position.set(offset, 2);
    const shape = new Graphics();
    shape
      .poly([-3, 0, 3, 0, 2.2 + (index % 2), 8 + (index % 3) * 2, 0, 13, -2.6, 7], true)
      .fill({ color: shade(robe, index % 2 === 0 ? -8 : 4), alpha: 0.82 });
    strip.addChild(shape);
    body.addChild(strip);
    strips.push(strip);
  }

  const core = new Graphics();
  core.circle(0, -22, 8).fill({ color: glow, alpha: 0.08 });
  core.circle(0, -22, 3.5).fill({ color: glow, alpha: 0.3 });
  body.addChild(core);

  const robeShape = new Graphics();
  robeShape
    .poly([-8, -34, -12, -11, -8, 2, 0, 5, 8, 2, 12, -11, 8, -34, 0, -39], true)
    .fill({ color: robe, alpha: 0.86 })
    .stroke({ color: ink, width: 1 });
  robeShape
    .poly([-6, -32, -8, -10, 0, -3, 8, -10, 6, -32, 0, -36], true)
    .fill({ color: shade(robe, 15), alpha: 0.35 });
  body.addChild(robeShape);

  const armLeft = new Container();
  const armRight = new Container();
  armLeft.position.set(-8, -25);
  armRight.position.set(8, -25);
  for (const arm of [armLeft, armRight]) {
    const g = new Graphics();
    g.moveTo(0, 0)
      .quadraticCurveTo(-2, 6, 1, 12)
      .stroke({ color: shade(robe, 12), width: 3.4 })
      .circle(1, 13, 2.2)
      .fill({ color: glow, alpha: 0.65 });
    arm.addChild(g);
    body.addChild(arm);
  }

  const head = new Container();
  head.position.set(0, -34);
  const hood = new Graphics();
  hood
    .poly([-7, 0, -6, -8, 0, -12, 6, -8, 7, 0, 3, 3, -3, 3], true)
    .fill({ color: shade(robe, -14) })
    .stroke({ color: ink, width: 1 });
  hood.circle(0, -4, 4.2).fill({ color: shade(ink, 8) });
  hood.circle(-1.8, -4, 0.9).fill({ color: glow, alpha: 0.95 });
  hood.circle(1.8, -4, 0.9).fill({ color: glow, alpha: 0.95 });
  head.addChild(hood);
  body.addChild(head);

  body.addChild(fxPlaceholder());
  return { kind: "spirit", body, head, armLeft, armRight, strips, core };
}

export function createActorRig(appearance: ActorAppearance): ActorRigParts {
  switch (appearance.body) {
    case "wolf":
      return buildBeast(appearance);
    case "shade":
      return buildSpirit(appearance);
    default:
      return buildHumanoid(appearance);
  }
}

export { shade as shadeActorColor };
