import "pixi.js/unsafe-eval";
import type { Hex, WorldState } from "@iwakura/contracts";
import { Application } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { WorldRenderer } from "./world-renderer";

export interface WorldCanvasProps {
  world: WorldState;
  partyHex: Hex;
  onTravel: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
}

export function WorldCanvas({ world, partyHex, onTravel, onHover }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const callbacksRef = useRef({ onTravel, onHover });
  const worldRef = useRef(world);
  const partyRef = useRef(partyHex);
  const [error, setError] = useState<string | null>(null);

  callbacksRef.current = { onTravel, onHover };
  worldRef.current = world;
  partyRef.current = partyHex;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const app = new Application();
    appRef.current = app;

    void app
      .init({
        backgroundColor: 0x080706,
        resizeTo: host,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        preference: "webgl",
      })
      .then(() => {
        if (disposed) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        const renderer = new WorldRenderer(app, worldRef.current, partyRef.current, {
          onTravel: (hex) => callbacksRef.current.onTravel(hex),
          onHover: (hex) => callbacksRef.current.onHover(hex),
        });
        rendererRef.current = renderer;
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });

    const observer = new ResizeObserver(() => {
      if (!app.renderer) return;
      app.resize();
      rendererRef.current?.handleResize();
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      } else if (app.renderer) {
        // If init finished but the renderer was never created, make sure the
        // canvas is removed. WorldRenderer.destroy handles the normal path.
        app.destroy({ removeView: true }, { children: true });
      }
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(world, partyHex);
  }, [world, partyHex]);

  if (error) {
    return (
      <div className="grid size-full place-items-center bg-void">
        <div className="max-w-md border border-blood/40 bg-blood/10 p-5 text-xs leading-6 text-[#e0b0aa]">
          The map renderer could not start: {error}
        </div>
      </div>
    );
  }

  return <div ref={hostRef} className="size-full" />;
}
