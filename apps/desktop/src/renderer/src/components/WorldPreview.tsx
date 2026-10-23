import { terrainCssColor } from "@iwakura/content";
import type { WorldState } from "@iwakura/contracts";
import { cornerOffset, hexToPixel, offsetToAxial } from "@iwakura/engine";
import { useEffect, useRef } from "react";

function drawWorld(canvas: HTMLCanvasElement, world: WorldState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const size = Math.min(
    width / (Math.sqrt(3) * (world.width + world.height / 2 + 2)),
    height / (1.5 * world.height + 3),
  );
  const mapWidth = Math.sqrt(3) * size * (world.width + world.height / 2);
  const mapHeight = size * (1.5 * world.height + 2);
  const offsetX = (width - mapWidth) / 2 + size;
  const offsetY = (height - mapHeight) / 2 + size;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Ocean backdrop.
  ctx.fillStyle = terrainCssColor("ocean");
  ctx.fillRect(-size, -size, mapWidth + size * 2, mapHeight + size * 2);

  const hexPath = (cx: number, cy: number) => {
    ctx.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
      const point = cornerOffset(corner, size);
      if (corner === 0) ctx.moveTo(cx + point.x, cy + point.y);
      else ctx.lineTo(cx + point.x, cy + point.y);
    }
    ctx.closePath();
  };

  for (let row = 0; row < world.height; row += 1) {
    for (let col = 0; col < world.width; col += 1) {
      const index = row * world.width + col;
      const terrain = world.terrain[index] ?? "ocean";
      const center = hexToPixel(offsetToAxial({ col, row }), size);
      hexPath(center.x, center.y);
      ctx.fillStyle = terrainCssColor(terrain);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (world.river[index]) {
        ctx.fillStyle = "rgba(74, 132, 158, 0.72)";
        hexPath(center.x, center.y);
        ctx.fill();
      }
    }
  }

  // Roads as a faint gold thread through the map.
  ctx.strokeStyle = "rgba(197, 166, 107, 0.8)";
  ctx.lineWidth = Math.max(1, size * 0.12);
  for (let row = 0; row < world.height; row += 1) {
    for (let col = 0; col < world.width; col += 1) {
      const index = row * world.width + col;
      if (!world.road[index]) continue;
      const center = hexToPixel(offsetToAxial({ col, row }), size);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const other = { col: col + dx, row: row + dy };
        if (other.col < 0 || other.col >= world.width || other.row < 0 || other.row >= world.height) continue;
        if (!world.road[other.row * world.width + other.col]) continue;
        const otherCenter = hexToPixel(offsetToAxial(other), size);
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(otherCenter.x, otherCenter.y);
        ctx.stroke();
      }
    }
  }

  const poiColors: Record<string, string> = {
    town: "#e8c987",
    village: "#c9a35a",
    dungeon: "#a45a3a",
    ruin: "#948872",
    shrine: "#8fb5b6",
    camp: "#b08d57",
    landmark: "#d8c89a",
  };

  for (const poi of world.pois) {
    const offset = { col: poi.hex.q + Math.floor(poi.hex.r / 2), row: poi.hex.r };
    const center = hexToPixel(offsetToAxial(offset), size);
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(2, size * (poi.kind === "town" ? 0.42 : 0.3)), 0, Math.PI * 2);
    ctx.fillStyle = poiColors[poi.kind] ?? "#e8c987";
    ctx.fill();
    ctx.strokeStyle = "rgba(8, 7, 6, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

export function WorldPreview({ world, className }: { world: WorldState; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawWorld(canvas, world);
    redraw();
    const observer = new ResizeObserver(redraw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [world]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="size-full" aria-label="World preview" />
    </div>
  );
}
