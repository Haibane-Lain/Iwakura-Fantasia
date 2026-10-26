import type {
  Bootstrap,
  GameState,
  HealthResponse,
  ModelInfo,
  SettingsResponse,
  WorldGenParams,
  WorldGenResult,
} from "@iwakura/contracts";
import { normalizeGameState } from "@iwakura/engine";
import { create } from "zustand";
import { ApiClient } from "../api/client";

export type Screen = "menu" | "campaign" | "character" | "world" | "lab" | "settings";
export type CampaignSaveState = "idle" | "saving" | "saved" | "error";
export type WorldMode = "atlas" | "travel";

// Serialize campaign writes so a rapid sequence of travels can never finish
// out of order and restore an older position.
let saveQueue: Promise<void> = Promise.resolve();

interface AppStore {
  screen: Screen;
  api: ApiClient | null;
  bootstrap: Bootstrap | null;
  settings: SettingsResponse | null;
  models: ModelInfo[];
  modelsSource: "live" | "cache" | "static";
  health: HealthResponse | null;
  campaign: GameState | null;
  campaignUpdatedAt: string | null;
  campaignSaveState: CampaignSaveState;
  pendingWorld: WorldGenResult | null;
  pendingWorldParams: WorldGenParams | null;
  helpOpen: boolean;
  worldMode: WorldMode;
  loading: boolean;
  bootError: string | null;
  setScreen: (screen: Screen) => void;
  setWorldMode: (mode: WorldMode) => void;
  init: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshModels: (refresh?: boolean) => Promise<void>;
  refreshHealth: () => Promise<void>;
  applySettings: (settings: SettingsResponse) => void;
  setCampaign: (campaign: GameState) => void;
  saveCampaign: (campaign: GameState) => Promise<void>;
  clearCampaign: () => Promise<void>;
  setPendingWorld: (result: WorldGenResult, params: WorldGenParams) => void;
  clearPendingWorld: () => void;
  setHelpOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: "menu",
  api: null,
  bootstrap: null,
  settings: null,
  models: [],
  modelsSource: "static",
  health: null,
  campaign: null,
  campaignUpdatedAt: null,
  campaignSaveState: "idle",
  pendingWorld: null,
  pendingWorldParams: null,
  helpOpen: false,
  worldMode: "atlas",
  loading: true,
  bootError: null,

  setScreen: (screen) => set({ screen }),
  setWorldMode: (mode) => set({ worldMode: mode }),

  init: async () => {
    try {
      if (!window.iwakura) {
        throw new Error("Electron bridge unavailable. Launch the app through Electron.");
      }
      const bootstrap = await window.iwakura.getBootstrap();
      const api = new ApiClient(bootstrap.apiBase, bootstrap.token);
      const [health, settings, models, saved] = await Promise.all([
        api.health(),
        api.getSettings(),
        api.getModels(),
        api.getCampaign(),
      ]);
      const hash = window.location.hash.replace(/^#/, "");
      const requestedScreen: Screen = ["menu", "campaign", "character", "world", "lab", "settings"].includes(
        hash,
      )
        ? (hash as Screen)
        : "menu";
      const initialScreen: Screen =
        (requestedScreen === "world" && !saved.campaign) ||
        (requestedScreen === "character" && !get().pendingWorld)
          ? "campaign"
          : requestedScreen;
      const campaign = saved.campaign ? normalizeGameState(saved.campaign) : null;
      set({
        api,
        bootstrap,
        health,
        settings,
        models: models.models,
        modelsSource: models.source,
        campaign,
        campaignUpdatedAt: saved.updatedAt,
        loading: false,
        bootError: null,
        screen: initialScreen,
        worldMode: campaign?.travel ? "travel" : "atlas",
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

  setCampaign: (campaign) => {
    const next = normalizeGameState(campaign);
    set({
      campaign: next,
      campaignUpdatedAt: next.campaign.updatedAt,
      campaignSaveState: "idle",
      worldMode: next.travel ? "travel" : "atlas",
    });
  },

  saveCampaign: async (campaign) => {
    const api = get().api;
    if (!api) return;
    set({ campaign, campaignSaveState: "saving" });
    const state = campaign;
    const write = async () => {
      try {
        const result = await api.saveCampaign(state);
        set({ campaignUpdatedAt: result.updatedAt, campaignSaveState: "saved" });
      } catch {
        set({ campaignSaveState: "error" });
      }
    };
    saveQueue = saveQueue.then(write, write);
    await saveQueue;
  },

  clearCampaign: async () => {
    const api = get().api;
    if (!api) return;
    await api.clearCampaign();
    set({ campaign: null, campaignUpdatedAt: null, campaignSaveState: "idle", worldMode: "atlas" });
  },

  setPendingWorld: (result, params) => set({ pendingWorld: result, pendingWorldParams: params }),

  clearPendingWorld: () => set({ pendingWorld: null, pendingWorldParams: null }),
  setHelpOpen: (open) => set({ helpOpen: open }),
}));
