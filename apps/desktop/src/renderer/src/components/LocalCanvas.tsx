import "pixi.js/unsafe-eval";
import type { Hex, LocalMap } from "@iwakura/contracts";
import { Application } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { type LocalNpcMarker, LocalRenderer } from "./local-renderer";

export interface LocalCanvasProps {
  map: LocalMap;
  partyHex: Hex;
  npcs: LocalNpcMarker[];
  hour?: number;
  partyActive?: boolean;
  reduceMotion?: boolean;
  onSelect: (hex: Hex) => void;
  onHover: (hex: Hex | null) => void;
}

export function LocalCanvas({
  map,
  partyHex,
  npcs,
  hour = 12,
  partyActive = false,
  reduceMotion = false,
  onSelect,
  onHover,
}: LocalCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<LocalRenderer | null>(null);
  const callbacksRef = useRef({ onSelect, onHover });
  const mapRef = useRef(map);
  const partyRef = useRef(partyHex);
  const npcRef = useRef(npcs);
  const hourRef = useRef(hour);
  const partyActiveRef = useRef(partyActive);
  const reduceMotionRef = useRef(reduceMotion);
  const [error, setError] = useState<string | null>(null);

  callbacksRef.current = { onSelect, onHover };
  mapRef.current = map;
  partyRef.current = partyHex;
  npcRef.current = npcs;
  hourRef.current = hour;
  partyActiveRef.current = partyActive;
  reduceMotionRef.current = reduceMotion;

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
        const renderer = new LocalRenderer(
          app,
          mapRef.current,
          partyRef.current,
          npcRef.current,
          {
            onSelect: (hex) => callbacksRef.current.onSelect(hex),
            onHover: (hex) => callbacksRef.current.onHover(hex),
          },
          hourRef.current,
          partyActiveRef.current,
          reduceMotionRef.current,
        );
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
        app.destroy({ removeView: true }, { children: true });
      }
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(map, partyHex, npcs);
  }, [map, partyHex, npcs]);

  useEffect(() => {
    rendererRef.current?.setHour(hour);
  }, [hour]);

  useEffect(() => {
    rendererRef.current?.setPartyActive(partyActive);
  }, [partyActive]);

  useEffect(() => {
    rendererRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  if (error) {
    return (
      <div className="grid size-full place-items-center bg-void">
        <div className="max-w-md border border-blood/40 bg-blood/10 p-5 text-xs leading-6 text-[#e0b0aa]">
          The local map renderer could not start: {error}
        </div>
      </div>
    );
  }

  return <div ref={hostRef} className="size-full" />;
}
