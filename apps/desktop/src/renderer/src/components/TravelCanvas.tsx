import "pixi.js/unsafe-eval";
import type { Hex, LocalMap, TravelEnemyGroup } from "@iwakura/contracts";
import { Application } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { type TravelCompanionMarker, TravelRenderer } from "./travel-renderer";

export interface TravelCanvasProps {
  map: LocalMap;
  partyHex: Hex;
  partyName: string;
  companions: TravelCompanionMarker[];
  enemies: TravelEnemyGroup[];
  paused?: boolean;
  hour?: number;
  reduceMotion?: boolean;
  onAnchor: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
  onFacing: (direction: number) => void;
}

export function TravelCanvas({
  map,
  partyHex,
  partyName,
  companions,
  enemies,
  paused = false,
  hour = 12,
  reduceMotion = false,
  onAnchor,
  onHover,
  onFacing,
}: TravelCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<TravelRenderer | null>(null);
  const callbacksRef = useRef({ onAnchor, onHover, onFacing });
  const pausedRef = useRef(paused);
  const initialRef = useRef({ map, partyHex, partyName, companions, enemies, hour, reduceMotion });
  const [error, setError] = useState<string | null>(null);

  callbacksRef.current = { onAnchor, onHover, onFacing };
  pausedRef.current = paused;

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
        const initial = initialRef.current;
        const renderer = new TravelRenderer(
          app,
          initial.map,
          initial.partyHex,
          initial.partyName,
          initial.companions,
          initial.enemies,
          {
            onAnchor: (hex) => callbacksRef.current.onAnchor(hex),
            onHover: (hex) => callbacksRef.current.onHover(hex),
            onFacing: (direction) => callbacksRef.current.onFacing(direction),
          },
          initial.hour,
          initial.reduceMotion,
        );
        rendererRef.current = renderer;
        renderer.setPaused(pausedRef.current);
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
        app.destroy({ removeView: true }, { children: true });
      }
      appRef.current = null;
    };
    // The map is immutable for the life of this canvas. A new world hex is
    // rendered by remounting the component with a new key.
  }, []);

  useEffect(() => {
    rendererRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    rendererRef.current?.setHour(hour);
  }, [hour]);

  useEffect(() => {
    rendererRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  if (error) {
    return (
      <div className="grid size-full place-items-center bg-void">
        <div className="max-w-md border border-blood/40 bg-blood/10 p-5 text-xs leading-6 text-[#e0b0aa]">
          The travel map could not start: {error}
        </div>
      </div>
    );
  }

  return <div ref={hostRef} className="size-full" />;
}
