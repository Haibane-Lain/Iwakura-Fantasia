import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const size = 256;
const pixels = Buffer.alloc(size * size * 4);
const gold = [201, 163, 90, 255];
const goldBright = [232, 201, 135, 255];
const ink = [8, 7, 6, 255];

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function hexContains(x, y, cx, cy, radius) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  return dy <= radius * 0.866 && dx * 0.866 + dy * 0.5 <= radius * 0.866;
}

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    setPixel(x, y, ink);
    if (hexContains(x, y, 128, 128, 112) && !hexContains(x, y, 128, 128, 98)) {
      setPixel(x, y, gold);
    }
  }
}

for (let y = 100; y < 168; y += 1) {
  for (let x = 104; x < 118; x += 1) setPixel(x, y, goldBright);
  for (let x = 148; x < 162; x += 1) setPixel(x, y, goldBright);
}
for (let y = 100; y < 116; y += 1) {
  for (let x = 104; x < 184; x += 1) setPixel(x, y, goldBright);
}
for (let y = 124; y < 138; y += 1) {
  for (let x = 138; x < 184; x += 1) setPixel(x, y, goldBright);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, "ascii");
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, crcBuffer]);
}

const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  raw[y * (size * 4 + 1)] = 0;
  pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0;
entry[1] = 0;
entry[4] = 1;
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);
const ico = Buffer.concat([header, entry, png]);

const buildDir = resolve("apps/desktop/build");
mkdirSync(buildDir, { recursive: true });
writeFileSync(resolve(buildDir, "icon.png"), png);
writeFileSync(resolve(buildDir, "icon.ico"), ico);
console.log(`icon.ico ${ico.length} bytes, icon.png ${png.length} bytes`);
