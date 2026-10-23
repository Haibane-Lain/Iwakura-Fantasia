import type { Bootstrap, HealthResponse, ModelInfo, SettingsResponse } from "@iwakura/contracts";
import { create } from "zustand";
import { ApiClient } from "../api/client";

export type Screen = "menu" | "campaign" | "lab" | "settings";

interface AppStore {
  screen: Screen;
  api: ApiClient | null;
  bootstrap: Bootstrap | null;
  settings: SettingsResponse | null;
  models: ModelInfo[];
  modelsSource: "live" | "cache" | "static";
  health: HealthResponse | null;
  loading: boolean;
  bootError: string | null;
  setScreen: (screen: Screen) => void;
  init: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshModels: (refresh?: boolean) => Promise<void>;
  refreshHealth: () => Promise<void>;
  applySettings: (settings: SettingsResponse) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: "menu",
  api: null,
  bootstrap: null,
  settings: null,
  models: [],
  modelsSource: "static",
  health: null,
  loading: true,
  bootError: null,

  setScreen: (screen) => set({ screen }),

  init: async () => {
    try {
      if (!window.iwakura) {
        throw new Error("Electron bridge unavailable. Launch the app through Electron.");
      }
      const bootstrap = await window.iwakura.getBootstrap();
      const api = new ApiClient(bootstrap.apiBase, bootstrap.token);
      const [health, settings, models] = await Promise.all([
        api.health(),
        api.getSettings(),
        api.getModels(),
      ]);
      const hash = window.location.hash.replace(/^#/, "");
      const initialScreen: Screen = ["menu", "campaign", "lab", "settings"].includes(hash)
        ? (hash as Screen)
        : "menu";
      set({
        api,
        bootstrap,
        health,
        settings,
        models: models.models,
        modelsSource: models.source,
        loading: false,
        bootError: null,
        screen: initialScreen,
      });
    } catch (error) {
      set({
        loading: false,
        bootError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshSettings: async () => {
    const api = get().api;
    if (!api) return;
    const settings = await api.getSettings();
    set({ settings });
  },

  refreshModels: async (refresh = false) => {
    const api = get().api;
    if (!api) return;
    const models = await api.getModels(refresh);
    set({ models: models.models, modelsSource: models.source });
  },

  refreshHealth: async () => {
    const api = get().api;
    if (!api) return;
    const health = await api.health();
    set({ health });
  },

  applySettings: (settings) => set({ settings }),
}));
