import { AlertTriangle, Hexagon, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { AppHeader } from "./components/AppHeader";
import { AiLab } from "./screens/AiLab";
import { MainMenu } from "./screens/MainMenu";
import { NewCampaign } from "./screens/NewCampaign";
import { SettingsScreen } from "./screens/SettingsScreen";
import { WorldScreen } from "./screens/WorldScreen";
import { useAppStore } from "./state/useAppStore";

function BootScreen() {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hex-field opacity-40" />
      <div className="relative flex flex-col items-center">
        <div className="relative grid size-24 place-items-center">
          <Hexagon className="absolute size-24 text-gold/25 spin-slow" strokeWidth={0.7} />
          <Hexagon className="absolute size-16 text-gold/45" strokeWidth={0.9} />
          <span className="font-display text-lg tracking-[0.12em] text-gold-bright">IF</span>
        </div>
        <h1 className="mt-6 font-display text-2xl tracking-[0.22em] text-parchment">IWAKURA FANTASIA</h1>
        <p className="mt-2 text-[10px] uppercase tracking-[0.28em] text-faint">Waking the local engine</p>
        <div className="mt-6 h-px w-40 overflow-hidden bg-line-soft">
          <div className="h-full w-1/2 animate-pulse-soft bg-gold/70" />
        </div>
      </div>
    </div>
  );
}

function BootError({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="panel max-w-lg p-6">
        <div className="flex items-center gap-2 text-[#e0b0aa]">
          <AlertTriangle className="size-4" />
          <span className="text-xs uppercase tracking-[0.16em]">The local engine did not answer</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-parchment-dim">{message}</p>
        <p className="mt-2 text-[11px] leading-5 text-faint">
          This usually means the Electron main process failed to start the loopback server. Check the terminal
          output, then try again.
        </p>
        <button type="button" className="btn btn-primary mt-5" onClick={() => window.location.reload()}>
          <RefreshCw className="size-3.5" />
          Restart the window
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useAppStore((state) => state.screen);
  const loading = useAppStore((state) => state.loading);
  const bootError = useAppStore((state) => state.bootError);
  const campaign = useAppStore((state) => state.campaign);
  const init = useAppStore((state) => state.init);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void init();
  }, [init]);

  if (loading) return <BootScreen />;
  if (bootError) return <BootError message={bootError} />;

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1">
        {screen === "menu" ? <MainMenu /> : null}
        {screen === "campaign" ? <NewCampaign /> : null}
        {screen === "world" ? campaign ? <WorldScreen /> : <NewCampaign /> : null}
        {screen === "lab" ? <AiLab /> : null}
        {screen === "settings" ? <SettingsScreen /> : null}
      </main>
    </div>
  );
}
