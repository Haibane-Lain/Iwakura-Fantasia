import { hashString } from "@iwakura/engine";
import { Texture } from "pixi.js";

const TILE_SIZE = 160;
const PROP_WIDTH = 112;
const PROP_HEIGHT = 144;
const TILE_VARIANTS = 4;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgb(color: number): Rgb {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shade(color: number, amount: number): number {
  const value = rgb(color);
  return (
    (clampByte(value.r + amount) << 16) | (clampByte(value.g + amount) << 8) | clampByte(value.b + amount)
  );
}

function css(color: number, alpha = 1): string {
  const value = rgb(color);
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${alpha})`;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  return context;
}

function textureFrom(context: CanvasRenderingContext2D, repeat = false): Texture {
  const texture = Texture.from(context.canvas, true);
  texture.source.scaleMode = "linear";
  texture.source.addressMode = repeat ? "repeat" : "clamp-to-edge";
  return texture;
}

function fillNoise(
  context: CanvasRenderingContext2D,
  rng: () => number,
  colors: number[],
  count: number,
  radius: number,
  alpha: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const color = colors[Math.floor(rng() * colors.length)] ?? colors[0] ?? 0xffffff;
    const x = rng() * context.canvas.width;
    const y = rng() * context.canvas.height;
    const size = 0.5 + rng() * radius;
    context.globalAlpha = alpha * (0.45 + rng() * 0.55);
    context.fillStyle = css(color);
    context.beginPath();
    context.ellipse(x, y, size, size * (0.45 + rng() * 0.8), rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintGrass(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  // Broad meadow patches first, then two passes of short blades. The layering
  // keeps the ground from reading as uniform noise at map zoom.
  for (let index = 0; index < 12; index += 1) {
    context.globalAlpha = 0.08 + rng() * 0.07;
    context.fillStyle = css(rng() > 0.46 ? shade(color, 16) : shade(color, -18));
    context.beginPath();
    context.ellipse(
      rng() * TILE_SIZE,
      rng() * TILE_SIZE,
      9 + rng() * 24,
      5 + rng() * 14,
      rng() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.globalAlpha = 1;

  context.lineCap = "round";
  for (let pass = 0; pass < 2; pass += 1) {
    const count = pass === 0 ? 420 : 250;
    const dark = pass === 1;
    context.lineWidth = pass === 0 ? 1.2 : 1.6;
    for (let index = 0; index < count; index += 1) {
      const x = rng() * TILE_SIZE;
      const y = rng() * TILE_SIZE;
      const lean = (rng() - 0.5) * 6;
      const height = 2.2 + rng() * (pass === 0 ? 5 : 8);
      context.globalAlpha = 0.16 + rng() * 0.3;
      context.strokeStyle = css(
        dark
          ? shade(color, -24 - rng() * 10)
          : rng() > 0.3
            ? shade(color, 20 + rng() * 14)
            : shade(color, -6),
      );
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(x + lean * 0.35, y - height * 0.55, x + lean, y - height);
      context.stroke();
    }
  }

  // Clover and a few bright meadow flowers break up the green without turning
  // every hex into a polka-dot pattern.
  for (let index = 0; index < 42; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const size = 0.8 + rng() * 1.5;
    context.globalAlpha = 0.18 + rng() * 0.22;
    context.fillStyle = css(rng() > 0.5 ? shade(color, 34) : shade(color, -22));
    context.beginPath();
    context.ellipse(x, y, size, size * 0.55, rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  for (let index = 0; index < 7; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const flower = rng() > 0.48 ? 0xf0e2a4 : 0xd8b8c5;
    context.globalAlpha = 0.5 + rng() * 0.3;
    context.fillStyle = css(flower);
    for (let petal = 0; petal < 4; petal += 1) {
      const angle = (petal / 4) * Math.PI * 2;
      context.beginPath();
      context.arc(x + Math.cos(angle) * 1.8, y + Math.sin(angle) * 1.8, 1.1, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 0.75;
    context.fillStyle = css(0x8f6e35);
    context.beginPath();
    context.arc(x, y, 0.8, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  // A handful of tiny stones and trodden dirt flecks.
  for (let index = 0; index < 23; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const size = 0.7 + rng() * 1.7;
    context.globalAlpha = 0.12 + rng() * 0.14;
    context.fillStyle = css(rng() > 0.5 ? shade(color, 53) : shade(color, -44));
    context.beginPath();
    context.ellipse(x, y, size, size * 0.55, rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintDirt(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  fillNoise(context, rng, [shade(color, 14), shade(color, -12), shade(color, 5)], 470, 2.6, 0.34);
  for (let index = 0; index < 34; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    context.globalAlpha = 0.2 + rng() * 0.22;
    context.strokeStyle = css(shade(color, -26));
    context.lineWidth = 0.8 + rng() * 1.6;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + 8 + rng() * 18, y - 2 + rng() * 4, x + 24 + rng() * 22, y + rng() * 4);
    context.stroke();
  }
  context.globalAlpha = 1;
  for (let index = 0; index < 38; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const size = 1 + rng() * 2.4;
    context.globalAlpha = 0.25 + rng() * 0.25;
    context.fillStyle = css(shade(color, rng() > 0.5 ? 34 : -26));
    context.beginPath();
    context.ellipse(x, y, size, size * 0.6, rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintRoadGround(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  paintDirt(context, rng, shade(color, -8));
  context.globalAlpha = 0.22;
  context.strokeStyle = css(shade(color, -38));
  context.lineWidth = 3;
  for (const offset of [0.28, 0.72]) {
    context.beginPath();
    const x = TILE_SIZE * offset;
    context.moveTo(x, 0);
    context.bezierCurveTo(x + 5, TILE_SIZE * 0.32, x - 4, TILE_SIZE * 0.68, x + 3, TILE_SIZE);
    context.stroke();
  }
  context.globalAlpha = 1;
  for (let index = 0; index < 28; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const size = 1 + rng() * 2.2;
    context.globalAlpha = 0.2 + rng() * 0.25;
    context.fillStyle = css(rng() > 0.4 ? shade(color, 34) : shade(color, -34));
    context.beginPath();
    context.ellipse(x, y, size, size * 0.6, rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintCobbles(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  context.fillStyle = css(shade(color, -16));
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const rowHeight = 18;
  for (let row = -1; row < TILE_SIZE / rowHeight + 1; row += 1) {
    const offset = row % 2 === 0 ? 0 : 12;
    for (let col = -1; col < TILE_SIZE / 26 + 1; col += 1) {
      const x = col * 26 + offset + rng() * 3;
      const y = row * rowHeight + rng() * 2;
      const width = 21 + rng() * 4;
      const height = 14 + rng() * 3;
      context.fillStyle = css(shade(color, -8 + rng() * 24));
      context.beginPath();
      context.roundRect(x, y, width, height, 3);
      context.fill();
      context.globalAlpha = 0.28;
      context.fillStyle = css(shade(color, 36));
      context.beginPath();
      context.roundRect(x + 1.5, y + 1, width - 3, 2, 1);
      context.fill();
      context.globalAlpha = 1;
    }
  }
  fillNoise(context, rng, [shade(color, -35), shade(color, 30)], 110, 1.4, 0.25);
}

function paintRoof(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  context.fillStyle = css(shade(color, -14));
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const rowHeight = 16;
  for (let row = -1; row < TILE_SIZE / rowHeight + 1; row += 1) {
    const offset = row % 2 === 0 ? 0 : 8;
    for (let col = -1; col < TILE_SIZE / 17 + 1; col += 1) {
      const x = col * 17 + offset;
      const y = row * rowHeight;
      context.fillStyle = css(shade(color, -7 + rng() * 15));
      context.fillRect(x + 1, y + 1, 15, rowHeight - 1);
      context.globalAlpha = 0.35;
      context.fillStyle = css(shade(color, 28));
      context.fillRect(x + 2, y + 2, 13, 2);
      context.globalAlpha = 1;
    }
    context.globalAlpha = 0.3;
    context.strokeStyle = css(shade(color, -38));
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, row * rowHeight);
    context.lineTo(TILE_SIZE, row * rowHeight);
    context.stroke();
    context.globalAlpha = 1;
  }
  fillNoise(context, rng, [shade(color, 18), shade(color, -22)], 130, 1.6, 0.22);
}

function paintStone(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  context.fillStyle = css(shade(color, -24));
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const rowHeight = 24;
  for (let row = -1; row < TILE_SIZE / rowHeight + 1; row += 1) {
    const offset = row % 2 === 0 ? 0 : 17;
    for (let col = -1; col < TILE_SIZE / 37 + 1; col += 1) {
      const x = col * 37 + offset + rng() * 2;
      const y = row * rowHeight + rng() * 2;
      const width = 32 + rng() * 5;
      const height = 20 + rng() * 3;
      context.fillStyle = css(shade(color, -6 + rng() * 20));
      context.beginPath();
      context.roundRect(x, y, width, height, 2);
      context.fill();
      context.globalAlpha = 0.28;
      context.strokeStyle = css(shade(color, 30));
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x + 2, y + 2);
      context.lineTo(x + width - 2, y + 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }
  fillNoise(context, rng, [shade(color, -30), shade(color, 26)], 160, 1.8, 0.2);
}

function paintWood(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  context.fillStyle = css(color);
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  for (let plank = 0; plank < 6; plank += 1) {
    const y = plank * 22;
    context.globalAlpha = 0.45;
    context.fillStyle = css(shade(color, -10 + rng() * 20));
    context.fillRect(0, y, TILE_SIZE, 19);
    context.globalAlpha = 0.5;
    context.strokeStyle = css(shade(color, -38));
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(0, y + 21);
    context.lineTo(TILE_SIZE, y + 21);
    context.stroke();
    context.globalAlpha = 1;
    for (let line = 0; line < 5; line += 1) {
      context.globalAlpha = 0.14 + rng() * 0.16;
      context.strokeStyle = css(rng() > 0.5 ? shade(color, 38) : shade(color, -32));
      context.lineWidth = 0.8;
      const startX = rng() * TILE_SIZE;
      context.beginPath();
      context.moveTo(startX, y + 3);
      context.bezierCurveTo(startX + 12, y + 7, startX + 24, y + 2, startX + 42, y + 8);
      context.stroke();
      context.globalAlpha = 1;
    }
  }
}

function paintField(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  paintGrass(context, rng, shade(color, -16));
  // Crop rows: alternate dark furrows and warm stalk tips so fields read as
  // cultivated land rather than slightly different grass.
  const rowGap = 13;
  for (let row = -rowGap; row < TILE_SIZE + rowGap; row += rowGap) {
    context.globalAlpha = 0.28;
    context.fillStyle = css(shade(color, -38));
    context.fillRect(0, row + 4, TILE_SIZE, 3.5);
    context.globalAlpha = 0.38;
    context.fillStyle = css(shade(color, 30));
    context.fillRect(0, row + 8, TILE_SIZE, 1.5);
    context.globalAlpha = 1;
    for (let index = 0; index < 26; index += 1) {
      const x = rng() * TILE_SIZE;
      const y = row + 1 + rng() * 7;
      const height = 2 + rng() * 5;
      context.globalAlpha = 0.24 + rng() * 0.24;
      context.strokeStyle = css(rng() > 0.35 ? shade(color, 36) : shade(color, -30));
      context.lineWidth = 0.8 + rng();
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (rng() - 0.5) * 2, y - height);
      context.stroke();
    }
    context.globalAlpha = 1;
  }
  // Field-edge weeds and a few stones.
  fillNoise(context, rng, [shade(color, 34), shade(color, -35)], 90, 1.5, 0.18);
}

function paintWater(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  context.fillStyle = css(shade(color, -12));
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const gradient = context.createLinearGradient(0, 0, 0, TILE_SIZE);
  gradient.addColorStop(0, css(shade(color, 18), 0.4));
  gradient.addColorStop(0.55, css(color, 0.12));
  gradient.addColorStop(1, css(shade(color, -38), 0.52));
  context.fillStyle = gradient;
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  for (let index = 0; index < 34; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const width = 9 + rng() * 42;
    context.globalAlpha = 0.13 + rng() * 0.22;
    context.strokeStyle = css(shade(color, 48 + rng() * 20));
    context.lineWidth = 0.8 + rng() * 1.3;
    context.beginPath();
    context.moveTo(x - width / 2, y);
    context.quadraticCurveTo(x, y - 2 - rng() * 4, x + width / 2, y);
    context.stroke();
    context.globalAlpha = 1;
  }
  // Pale caustic loops.
  for (let index = 0; index < 8; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const radius = 4 + rng() * 13;
    context.globalAlpha = 0.08 + rng() * 0.08;
    context.strokeStyle = css(shade(color, 65));
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.34, rng() * Math.PI, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }
  fillNoise(context, rng, [shade(color, -30), shade(color, 24)], 80, 1.2, 0.18);
}

function paintSnow(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  fillNoise(context, rng, [shade(color, 10), shade(color, -7)], 350, 2.2, 0.34);
  for (let index = 0; index < 38; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const width = 7 + rng() * 22;
    context.globalAlpha = 0.12 + rng() * 0.12;
    context.strokeStyle = css(shade(color, -30));
    context.lineWidth = 1 + rng() * 1.2;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + width / 2, y - 4, x + width, y + 1);
    context.stroke();
    context.globalAlpha = 1;
  }
}

function paintSand(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  fillNoise(context, rng, [shade(color, 15), shade(color, -14)], 380, 1.8, 0.32);
  for (let index = 0; index < 22; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    const width = 6 + rng() * 20;
    context.globalAlpha = 0.14 + rng() * 0.12;
    context.strokeStyle = css(shade(color, 25));
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x - width / 2, y);
    context.quadraticCurveTo(x, y - 3, x + width / 2, y);
    context.stroke();
    context.globalAlpha = 1;
  }
}

function paintMarsh(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  paintGrass(context, rng, shade(color, -8));
  context.globalAlpha = 0.2;
  context.fillStyle = css(0x2e5363);
  for (let index = 0; index < 11; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    context.beginPath();
    context.ellipse(x, y, 5 + rng() * 14, 2 + rng() * 6, rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  for (let index = 0; index < 26; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    context.globalAlpha = 0.3 + rng() * 0.25;
    context.strokeStyle = css(0x9ba875);
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(x, y + 5);
    context.lineTo(x + 1, y - 5 - rng() * 5);
    context.stroke();
    context.globalAlpha = 1;
  }
}

function paintRock(context: CanvasRenderingContext2D, rng: () => number, color: number): void {
  paintStone(context, rng, shade(color, -10));
  for (let index = 0; index < 9; index += 1) {
    const x = rng() * TILE_SIZE;
    const y = rng() * TILE_SIZE;
    context.globalAlpha = 0.2 + rng() * 0.2;
    context.strokeStyle = css(shade(color, -38));
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 8 + rng() * 18, y + 4 + rng() * 18);
    context.lineTo(x + 16 + rng() * 20, y + 2 + rng() * 14);
    context.stroke();
    context.globalAlpha = 1;
  }
}

function paintTileBase(
  context: CanvasRenderingContext2D,
  tileId: string,
  color: number,
  rng: () => number,
): void {
  context.fillStyle = css(color);
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  if (tileId === "water") paintWater(context, rng, color);
  else if (tileId === "snow") paintSnow(context, rng, color);
  else if (tileId === "sand") paintSand(context, rng, color);
  else if (tileId === "marsh") paintMarsh(context, rng, color);
  else if (tileId === "road") paintRoadGround(context, rng, color);
  else if (tileId === "plaza") paintCobbles(context, rng, color);
  else if (tileId === "bridge") paintWood(context, rng, color);
  else if (tileId === "roof") paintRoof(context, rng, color);
  else if (tileId === "stone_wall" || tileId === "stone_floor") paintStone(context, rng, color);
  else if (tileId === "cliff" || tileId === "rock") paintRock(context, rng, color);
  else if (tileId === "wood_floor") paintWood(context, rng, color);
  else if (tileId === "field" || tileId === "crop") paintField(context, rng, color);
  else if (tileId === "ruin_floor" || tileId === "high_ground") paintDirt(context, rng, color);
  else paintGrass(context, rng, color);
}

const tileCache = new Map<string, Texture[]>();

export function tileTexture(tileId: string, color: number, variant = 0): Texture {
  const key = `${tileId}:${color}:${variant % TILE_VARIANTS}`;
  const cached = tileCache.get(key);
  if (cached) {
    const found = cached[variant % TILE_VARIANTS];
    if (found) return found;
  }

  const variants: Texture[] = [];
  for (let index = 0; index < TILE_VARIANTS; index += 1) {
    const context = canvasContext(TILE_SIZE, TILE_SIZE);
    const rng = mulberry32(hashString(`iso-tile:${tileId}:${color}:${index}`));
    paintTileBase(context, tileId, color, rng);

    // A soft top-left light and a darkened rim make flat hexes read as raised
    // surfaces even when the tile itself has no height.
    const light = context.createLinearGradient(0, 0, TILE_SIZE, TILE_SIZE);
    light.addColorStop(0, "rgba(255, 246, 224, 0.08)");
    light.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    light.addColorStop(1, "rgba(0, 0, 0, 0.12)");
    context.fillStyle = light;
    context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    const rim = context.createRadialGradient(
      TILE_SIZE / 2,
      TILE_SIZE / 2,
      TILE_SIZE * 0.2,
      TILE_SIZE / 2,
      TILE_SIZE / 2,
      TILE_SIZE * 0.72,
    );
    rim.addColorStop(0, "rgba(0, 0, 0, 0)");
    rim.addColorStop(1, "rgba(0, 0, 0, 0.15)");
    context.fillStyle = rim;
    context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    variants.push(textureFrom(context));
  }
  tileCache.set(key, variants);
  return variants[variant % TILE_VARIANTS]!;
}

export function terrainTopColor(tileId: string, color: number): number {
  if (tileId === "stone_wall") return 0x1b1916;
  if (tileId === "cliff") return 0x45413a;
  return color;
}

export function terrainSideTexture(tileId: string, color: number, variant: number): Texture {
  if (tileId === "stone_wall") return tileTexture("stone_floor", 0x766a56, variant);
  if (tileId === "cliff") return tileTexture("rock", 0x5a5449, variant);
  if (tileId === "high_ground") return tileTexture("ruin_floor", 0x8a7d5e, variant);
  return tileTexture(tileId, color, variant);
}

const animatedWaterCache = new Map<string, Texture>();

/** Seamless water texture whose texture matrix can be scrolled by the renderer. */
export function animatedWaterTexture(color: number, variant = 0): Texture {
  const key = `${color}:${variant % TILE_VARIANTS}`;
  const cached = animatedWaterCache.get(key);
  if (cached) return cached;

  const size = 256;
  const context = canvasContext(size, size);
  const rng = mulberry32(hashString(`iso-water:${key}`));
  context.fillStyle = css(shade(color, -16));
  context.fillRect(0, 0, size, size);
  context.fillStyle = css(shade(color, -4));
  context.fillRect(0, 0, size, size);

  // Periodic wave bands and caustic arcs. Every path uses a full sine period so
  // the texture remains seamless when scrolled in either direction.
  for (let band = 0; band < 16; band += 1) {
    const baseY = (band / 16) * size + (rng() - 0.5) * 5;
    const amplitude = 1.2 + rng() * 3.2;
    const frequency = 1 + Math.floor(rng() * 3);
    const phase = rng() * Math.PI * 2;
    context.globalAlpha = 0.1 + rng() * 0.18;
    context.strokeStyle = css(shade(color, 44 + rng() * 24));
    context.lineWidth = 0.8 + rng() * 1.8;
    context.beginPath();
    for (let step = 0; step <= 64; step += 1) {
      const x = (step / 64) * size;
      const y = baseY + Math.sin((x / size) * Math.PI * 2 * frequency + phase) * amplitude;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;

  for (let index = 0; index < 26; index += 1) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = 4 + rng() * 16;
    context.globalAlpha = 0.06 + rng() * 0.08;
    context.strokeStyle = css(shade(color, 70));
    context.lineWidth = 1.1;
    for (const [dx, dy] of [
      [0, 0],
      [-size, 0],
      [size, 0],
      [0, -size],
      [0, size],
    ] as const) {
      context.beginPath();
      context.ellipse(cx + dx, cy + dy, radius, radius * 0.32, rng() * 0.4, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  for (let index = 0; index < 75; index += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const length = 1 + rng() * 4;
    context.globalAlpha = 0.08 + rng() * 0.14;
    context.strokeStyle = css(shade(color, 54));
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y);
    context.stroke();
    context.globalAlpha = 1;
  }

  const texture = textureFrom(context, true);
  animatedWaterCache.set(key, texture);
  return texture;
}

const wallCache = new Map<string, Texture>();

export function wallTexture(style: "plaster" | "stone" | "timber", color: number): Texture {
  const key = `${style}:${color}`;
  const cached = wallCache.get(key);
  if (cached) return cached;

  const context = canvasContext(TILE_SIZE, TILE_SIZE);
  const rng = mulberry32(hashString(`iso-wall:${key}`));
  if (style === "stone") {
    paintStone(context, rng, color);
  } else if (style === "timber") {
    paintWood(context, rng, color);
  } else {
    context.fillStyle = css(color);
    context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    fillNoise(context, rng, [shade(color, 18), shade(color, -18)], 340, 2, 0.24);
    context.globalAlpha = 0.55;
    context.fillStyle = css(shade(color, -65));
    context.fillRect(0, 24, TILE_SIZE, 7);
    context.fillRect(0, 91, TILE_SIZE, 7);
    for (let x = 0; x < TILE_SIZE; x += 34) context.fillRect(x, 0, 6, TILE_SIZE);
    context.globalAlpha = 1;
  }

  const light = context.createLinearGradient(0, 0, 0, TILE_SIZE);
  light.addColorStop(0, "rgba(255, 248, 226, 0.12)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.16)");
  context.fillStyle = light;
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  const texture = textureFrom(context, true);
  wallCache.set(key, texture);
  return texture;
}

const roofCache = new Map<string, Texture>();

export function roofTexture(color: number): Texture {
  const key = String(color);
  const cached = roofCache.get(key);
  if (cached) return cached;
  const context = canvasContext(TILE_SIZE, TILE_SIZE);
  paintRoof(context, mulberry32(hashString(`iso-roof:${color}`)), color);
  const texture = textureFrom(context, true);
  roofCache.set(key, texture);
  return texture;
}

const propCache = new Map<string, Texture>();

function quietBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: number,
): void {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, css(color, 0));
  gradient.addColorStop(0.7, css(color, 0.05));
  gradient.addColorStop(1, css(color, 0.26));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function paintTree(context: CanvasRenderingContext2D, rng: () => number, pine: boolean): void {
  const width = PROP_WIDTH;
  const height = PROP_HEIGHT;
  quietBackground(context, width, height, 0x11180f);
  const baseX = width / 2;
  const baseY = height - 14;

  context.globalAlpha = 0.34;
  context.fillStyle = "#10140d";
  context.beginPath();
  context.ellipse(baseX, baseY + 5, 36, 11, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.strokeStyle = "#4b3524";
  context.lineWidth = 7;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(baseX, baseY);
  context.lineTo(baseX - 2, baseY - 58);
  context.stroke();
  context.strokeStyle = "#6b4b2d";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(baseX - 2, baseY - 22);
  context.lineTo(baseX - 16, baseY - 48);
  context.moveTo(baseX - 1, baseY - 36);
  context.lineTo(baseX + 16, baseY - 62);
  context.stroke();

  if (pine) {
    for (let layer = 0; layer < 4; layer += 1) {
      const y = baseY - 40 - layer * 23;
      const spread = 38 - layer * 6;
      context.fillStyle = layer % 2 === 0 ? "#263c24" : "#344c2c";
      context.beginPath();
      context.moveTo(baseX, y - 27);
      context.lineTo(baseX + spread, y + 15);
      context.lineTo(baseX - spread, y + 15);
      context.closePath();
      context.fill();
      context.globalAlpha = 0.25;
      context.strokeStyle = "#6f8950";
      context.lineWidth = 1.2;
      context.stroke();
      context.globalAlpha = 1;
    }
  } else {
    const blobs = [
      { x: -27, y: -86, r: 26 },
      { x: 3, y: -104, r: 31 },
      { x: 28, y: -80, r: 25 },
      { x: -7, y: -69, r: 30 },
      { x: 19, y: -58, r: 21 },
    ];
    for (const [index, blob] of blobs.entries()) {
      context.globalAlpha = 0.3;
      context.fillStyle = "#0b110a";
      context.beginPath();
      context.ellipse(baseX + blob.x + 4, baseY + blob.y + 7, blob.r, blob.r * 0.72, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = index % 3 === 0 ? "#405a34" : index % 3 === 1 ? "#344c2c" : "#2b4027";
      context.beginPath();
      context.ellipse(baseX + blob.x, baseY + blob.y, blob.r, blob.r * 0.75, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.35;
      context.strokeStyle = "#7d975c";
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(baseX + blob.x - 5, baseY + blob.y - 7, blob.r * 0.62, 3.4, 5.5);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  for (let index = 0; index < 18; index += 1) {
    context.globalAlpha = 0.15 + rng() * 0.2;
    context.fillStyle = rng() > 0.5 ? "#8aa76a" : "#1b2a18";
    const x = baseX - 34 + rng() * 68;
    const y = baseY - 112 + rng() * 76;
    context.beginPath();
    context.arc(x, y, 1 + rng() * 2.5, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }
}

function paintBush(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = PROP_WIDTH;
  const height = PROP_HEIGHT;
  quietBackground(context, width, height, 0x11180f);
  const baseX = width / 2;
  const baseY = height - 20;
  context.globalAlpha = 0.28;
  context.fillStyle = "#10140d";
  context.beginPath();
  context.ellipse(baseX, baseY + 5, 30, 8, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  for (const [index, blob] of [
    { x: -19, y: -15, r: 16 },
    { x: 2, y: -23, r: 21 },
    { x: 20, y: -13, r: 15 },
    { x: -3, y: -9, r: 18 },
  ].entries()) {
    context.fillStyle = index % 2 === 0 ? "#31452a" : "#3e5532";
    context.beginPath();
    context.ellipse(baseX + blob.x, baseY + blob.y, blob.r, blob.r * 0.65, 0, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.28;
    context.strokeStyle = "#7e945c";
    context.lineWidth = 1;
    context.stroke();
    context.globalAlpha = 1;
  }
  for (let index = 0; index < 12; index += 1) {
    context.globalAlpha = 0.15 + rng() * 0.2;
    context.fillStyle = rng() > 0.5 ? "#93a96c" : "#1f2c1a";
    context.beginPath();
    context.arc(baseX - 24 + rng() * 48, baseY - 32 + rng() * 26, 1 + rng() * 1.8, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }
}

function paintRockProp(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = PROP_WIDTH;
  const height = PROP_HEIGHT;
  quietBackground(context, width, height, 0x11100d);
  const baseX = width / 2;
  const baseY = height - 22;
  context.globalAlpha = 0.28;
  context.fillStyle = "#080706";
  context.beginPath();
  context.ellipse(baseX, baseY + 4, 32, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  const points: Array<[number, number]> = [];
  const count = 7;
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const radius = 21 + rng() * 15;
    points.push([baseX + Math.cos(angle) * radius, baseY - 14 + Math.sin(angle) * radius * 0.62]);
  }
  context.fillStyle = "#5d574c";
  context.beginPath();
  const first = points[0]!;
  context.moveTo(first[0], first[1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
  context.globalAlpha = 0.3;
  context.strokeStyle = "#2a2721";
  context.lineWidth = 2;
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = "#756d5f";
  context.beginPath();
  context.moveTo(baseX - 20, baseY - 18);
  context.lineTo(baseX - 3, baseY - 42);
  context.lineTo(baseX + 13, baseY - 20);
  context.lineTo(baseX - 5, baseY - 9);
  context.closePath();
  context.fill();
  context.globalAlpha = 0.3;
  context.strokeStyle = "#a49a86";
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(baseX - 14, baseY - 24);
  context.lineTo(baseX + 4, baseY - 34);
  context.stroke();
  context.globalAlpha = 1;
}

function paintCrate(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = PROP_WIDTH;
  const height = PROP_HEIGHT;
  quietBackground(context, width, height, 0x11100d);
  const baseX = width / 2;
  const baseY = height - 22;
  context.globalAlpha = 0.26;
  context.fillStyle = "#080706";
  context.beginPath();
  context.ellipse(baseX, baseY + 4, 24, 7, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = "#6e5133";
  context.fillRect(baseX - 22, baseY - 34, 44, 34);
  context.fillStyle = "#8b6a43";
  context.beginPath();
  context.moveTo(baseX - 22, baseY - 34);
  context.lineTo(baseX - 12, baseY - 44);
  context.lineTo(baseX + 34, baseY - 44);
  context.lineTo(baseX + 22, baseY - 34);
  context.closePath();
  context.fill();
  context.fillStyle = "#5b4229";
  context.beginPath();
  context.moveTo(baseX + 22, baseY - 34);
  context.lineTo(baseX + 34, baseY - 44);
  context.lineTo(baseX + 34, baseY - 10);
  context.lineTo(baseX + 22, baseY);
  context.closePath();
  context.fill();
  context.strokeStyle = "#3c2b1c";
  context.lineWidth = 2;
  context.strokeRect(baseX - 22, baseY - 34, 44, 34);
  context.beginPath();
  context.moveTo(baseX - 22, baseY - 34);
  context.lineTo(baseX + 22, baseY);
  context.moveTo(baseX + 22, baseY - 34);
  context.lineTo(baseX - 22, baseY);
  context.stroke();
  for (let index = 0; index < 18; index += 1) {
    context.globalAlpha = 0.1 + rng() * 0.2;
    context.fillStyle = index % 2 === 0 ? "#d1b27b" : "#2d2117";
    context.fillRect(baseX - 20 + rng() * 40, baseY - 33 + rng() * 31, 1 + rng() * 2, 1);
    context.globalAlpha = 1;
  }
}

function paintBarrel(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = PROP_WIDTH;
  const height = PROP_HEIGHT;
  quietBackground(context, width, height, 0x11100d);
  const baseX = width / 2;
  const baseY = height - 22;
  context.globalAlpha = 0.26;
  context.fillStyle = "#080706";
  context.beginPath();
  context.ellipse(baseX, baseY + 4, 20, 6, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = "#6d4c2d";
  context.beginPath();
  context.roundRect(baseX - 17, baseY - 38, 34, 38, 8);
  context.fill();
  context.fillStyle = "#8f6b42";
  context.beginPath();
  context.ellipse(baseX, baseY - 38, 17, 6, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#34251a";
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(baseX, baseY - 28, 17, 5, 0, 0, Math.PI);
  context.ellipse(baseX, baseY - 8, 17, 5, 0, 0, Math.PI);
  context.stroke();
  for (let index = 0; index < 14; index += 1) {
    context.globalAlpha = 0.1 + rng() * 0.16;
    context.fillStyle = index % 2 === 0 ? "#d1a66f" : "#382619";
    context.fillRect(baseX - 15 + rng() * 30, baseY - 36 + rng() * 34, 1, 1 + rng() * 2);
    context.globalAlpha = 1;
  }
}

function paintGlow(context: CanvasRenderingContext2D): void {
  const width = PROP_WIDTH;
  const height = PROP_HEIGHT;
  const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  gradient.addColorStop(0, "rgba(255, 226, 151, 0.9)");
  gradient.addColorStop(0.18, "rgba(255, 190, 93, 0.4)");
  gradient.addColorStop(0.55, "rgba(255, 154, 59, 0.12)");
  gradient.addColorStop(1, "rgba(255, 154, 59, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function paintTuft(context: CanvasRenderingContext2D, rng: () => number, dry = false): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const baseX = width / 2;
  const baseY = height - 6;
  const colors = dry ? [0x8e7b45, 0xb39856, 0x6f5e35, 0xc8ad68] : [0x3d552f, 0x587640, 0x2d4028, 0x789255];
  context.lineCap = "round";
  for (let blade = 0; blade < 12; blade += 1) {
    const lean = (rng() - 0.5) * width * 0.7;
    const bladeHeight = height * (0.25 + rng() * 0.6);
    const startX = baseX + (rng() - 0.5) * width * 0.25;
    context.globalAlpha = 0.65 + rng() * 0.3;
    context.strokeStyle = css(colors[Math.floor(rng() * colors.length)] ?? colors[0]!);
    context.lineWidth = 1.2 + rng() * 2.2;
    context.beginPath();
    context.moveTo(startX, baseY);
    context.quadraticCurveTo(
      startX + lean * 0.25,
      baseY - bladeHeight * 0.55,
      startX + lean,
      baseY - bladeHeight,
    );
    context.stroke();
  }
  if (!dry) {
    for (let index = 0; index < 3; index += 1) {
      const x = baseX + (rng() - 0.5) * width * 0.6;
      const y = baseY - height * (0.25 + rng() * 0.35);
      context.globalAlpha = 0.75;
      context.fillStyle = css(rng() > 0.5 ? 0xe6d89c : 0xd9c1ca);
      for (let petal = 0; petal < 4; petal += 1) {
        const angle = (petal / 4) * Math.PI * 2;
        context.beginPath();
        context.arc(x + Math.cos(angle) * 2, y + Math.sin(angle) * 2, 1.2, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  context.globalAlpha = 0.25;
  context.fillStyle = css(0x17150f);
  context.beginPath();
  context.ellipse(baseX, baseY + 2, width * 0.23, 3, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function paintReeds(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const baseX = width / 2;
  const baseY = height - 7;
  context.lineCap = "round";
  for (let reed = 0; reed < 16; reed += 1) {
    const x = baseX + (rng() - 0.5) * width * 0.7;
    const topY = baseY - height * (0.35 + rng() * 0.52);
    const lean = (rng() - 0.5) * 8;
    context.globalAlpha = 0.65 + rng() * 0.3;
    context.strokeStyle = css(rng() > 0.4 ? 0x71804f : 0x4e5d3b);
    context.lineWidth = 1.2 + rng() * 1.5;
    context.beginPath();
    context.moveTo(x, baseY);
    context.quadraticCurveTo(x + lean * 0.3, (baseY + topY) / 2, x + lean, topY);
    context.stroke();
    if (rng() > 0.55) {
      context.fillStyle = css(0x7a5135);
      context.beginPath();
      context.ellipse(x + lean, topY + 2, 2.4, 7, 0.1, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

function paintFlowers(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const baseY = height - 5;
  for (let index = 0; index < 10; index += 1) {
    const x = width * 0.2 + rng() * width * 0.6;
    const stem = 5 + rng() * 10;
    context.globalAlpha = 0.65;
    context.strokeStyle = css(0x526b3e);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, baseY);
    context.lineTo(x + (rng() - 0.5) * 4, baseY - stem);
    context.stroke();
    context.globalAlpha = 0.95;
    context.fillStyle = css([0xe7d79d, 0xd9b9c2, 0xeee5c8, 0xb8c97d][Math.floor(rng() * 4)] ?? 0xe7d79d);
    const flowerX = x + (rng() - 0.5) * 4;
    const flowerY = baseY - stem;
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = (petal / 5) * Math.PI * 2;
      context.beginPath();
      context.arc(flowerX + Math.cos(angle) * 2.3, flowerY + Math.sin(angle) * 2.3, 1.5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = css(0x9b7432);
    context.beginPath();
    context.arc(flowerX, flowerY, 1.2, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintMountain(context: CanvasRenderingContext2D, rng: () => number): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const baseY = height - 10;
  const centerX = width / 2;
  context.globalAlpha = 0.24;
  context.fillStyle = "#090a08";
  context.beginPath();
  context.ellipse(centerX, baseY + 4, width * 0.35, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  const peaks = [
    { x: -0.28, height: 0.6, width: 0.36 },
    { x: 0.01, height: 0.9, width: 0.4 },
    { x: 0.3, height: 0.56, width: 0.33 },
  ];
  for (const [index, peak] of peaks.entries()) {
    const x = centerX + peak.x * width;
    const top = baseY - peak.height * (height - 18);
    const half = peak.width * width * 0.5;
    context.fillStyle = index === 1 ? "#5b5a56" : "#494a47";
    context.beginPath();
    context.moveTo(x - half, baseY + 2);
    context.lineTo(x - half * 0.15, top + (baseY - top) * 0.24);
    context.lineTo(x, top);
    context.lineTo(x + half * 0.4, baseY - (baseY - top) * 0.24);
    context.lineTo(x + half, baseY + 2);
    context.closePath();
    context.fill();
    context.globalAlpha = 0.45;
    context.fillStyle = "#20231f";
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x + half * 0.4, baseY - (baseY - top) * 0.24);
    context.lineTo(x + half, baseY + 2);
    context.lineTo(x - half * 0.15, top + (baseY - top) * 0.24);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;

    if (peak.height > 0.55) {
      context.fillStyle = "#d7d9d1";
      context.globalAlpha = 0.9;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x - half * 0.3, top + (baseY - top) * 0.25);
      context.lineTo(x - half * 0.05, top + (baseY - top) * 0.19);
      context.lineTo(x + half * 0.2, top + (baseY - top) * 0.3);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    }
    context.globalAlpha = 0.16;
    context.strokeStyle = "#191b18";
    context.lineWidth = 1;
    for (let crack = 0; crack < 4; crack += 1) {
      const startX = x - half * 0.5 + rng() * half;
      const startY = top + (baseY - top) * (0.2 + rng() * 0.65);
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(startX + (rng() - 0.5) * 12, startY + 8 + rng() * 14);
      context.stroke();
    }
    context.globalAlpha = 1;
  }
}

export type PropTextureKind =
  | "tree"
  | "pine"
  | "bush"
  | "rock"
  | "crate"
  | "barrel"
  | "glow"
  | "tuft"
  | "wheat"
  | "reeds"
  | "flowers"
  | "mountain";

export function propTexture(kind: PropTextureKind, variant = 0): Texture {
  const key = `${kind}:${variant}`;
  const cached = propCache.get(key);
  if (cached) return cached;
  const size =
    kind === "mountain"
      ? ({ width: 224, height: 160 } as const)
      : kind === "reeds"
        ? ({ width: 84, height: 132 } as const)
        : kind === "tuft" || kind === "wheat" || kind === "flowers"
          ? ({ width: 72, height: 72 } as const)
          : ({ width: PROP_WIDTH, height: PROP_HEIGHT } as const);
  const context = canvasContext(size.width, size.height);
  const rng = mulberry32(hashString(`iso-prop:${key}`));
  if (kind === "tree") paintTree(context, rng, false);
  else if (kind === "pine") paintTree(context, rng, true);
  else if (kind === "bush") paintBush(context, rng);
  else if (kind === "rock") paintRockProp(context, rng);
  else if (kind === "crate") paintCrate(context, rng);
  else if (kind === "barrel") paintBarrel(context, rng);
  else if (kind === "tuft") paintTuft(context, rng);
  else if (kind === "wheat") paintTuft(context, rng, true);
  else if (kind === "reeds") paintReeds(context, rng);
  else if (kind === "flowers") paintFlowers(context, rng);
  else if (kind === "mountain") paintMountain(context, rng);
  else paintGlow(context);
  const texture = textureFrom(context);
  propCache.set(key, texture);
  return texture;
}

const ribbonCache = new Map<string, Texture>();

export function ribbonTexture(kind: "road" | "water" | "path", color: number): Texture {
  const key = `${kind}:${color}`;
  const cached = ribbonCache.get(key);
  if (cached) return cached;
  const width = 64;
  const height = 64;
  const context = canvasContext(width, height);
  const rng = mulberry32(hashString(`iso-ribbon:${key}`));

  if (kind === "road") {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, css(shade(color, -25), 0));
    gradient.addColorStop(0.18, css(shade(color, -18), 0.82));
    gradient.addColorStop(0.5, css(color, 0.98));
    gradient.addColorStop(0.82, css(shade(color, -18), 0.82));
    gradient.addColorStop(1, css(shade(color, -25), 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    fillNoise(context, rng, [shade(color, 24), shade(color, -30)], 160, 2, 0.25);
    // Two worn wheel ruts and a lighter crown.
    for (const rut of [0.34, 0.66]) {
      context.globalAlpha = 0.2;
      context.strokeStyle = css(shade(color, -46));
      context.lineWidth = 3.4;
      context.beginPath();
      const x = width * rut;
      context.moveTo(x, 0);
      context.bezierCurveTo(x + 3, height * 0.3, x - 3, height * 0.7, x + 1, height);
      context.stroke();
      context.globalAlpha = 1;
    }
    context.globalAlpha = 0.18;
    context.fillStyle = css(shade(color, 42));
    context.fillRect(width * 0.47, 0, width * 0.06, height);
    context.globalAlpha = 1;
    for (let index = 0; index < 28; index += 1) {
      const x = width * 0.16 + rng() * width * 0.68;
      const y = rng() * height;
      const size = 0.8 + rng() * 2.2;
      context.globalAlpha = 0.2 + rng() * 0.26;
      context.fillStyle = css(rng() > 0.4 ? shade(color, 34) : shade(color, -38));
      context.beginPath();
      context.ellipse(x, y, size, size * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    for (let index = 0; index < 8; index += 1) {
      const x = width * 0.2 + rng() * width * 0.6;
      context.globalAlpha = 0.13 + rng() * 0.13;
      context.strokeStyle = css(shade(color, -48));
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + (rng() - 0.5) * 6, height);
      context.stroke();
      context.globalAlpha = 1;
    }
  } else if (kind === "water") {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, css(shade(color, -20), 0));
    gradient.addColorStop(0.2, css(color, 0.95));
    gradient.addColorStop(0.8, css(color, 0.95));
    gradient.addColorStop(1, css(shade(color, -20), 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 18; index += 1) {
      const x = rng() * width;
      const y = rng() * height;
      context.globalAlpha = 0.18 + rng() * 0.25;
      context.strokeStyle = css(shade(color, 55));
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x - 8, y);
      context.quadraticCurveTo(x, y - 3, x + 8, y);
      context.stroke();
      context.globalAlpha = 1;
    }
  } else {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(201, 163, 90, 0)");
    gradient.addColorStop(0.35, "rgba(201, 163, 90, 0.22)");
    gradient.addColorStop(0.5, "rgba(201, 163, 90, 0.5)");
    gradient.addColorStop(0.65, "rgba(201, 163, 90, 0.22)");
    gradient.addColorStop(1, "rgba(201, 163, 90, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  const texture = textureFrom(context, true);
  ribbonCache.set(key, texture);
  return texture;
}

let dot: Texture | null = null;

export function dotTexture(): Texture {
  if (dot) return dot;
  const context = canvasContext(32, 32);
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.3, "rgba(255, 244, 214, 0.8)");
  gradient.addColorStop(1, "rgba(255, 244, 214, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  dot = textureFrom(context);
  return dot;
}
