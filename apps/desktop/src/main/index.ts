import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type KeySource, type Keystore, type RunningServer, startServer } from "@iwakura/server";
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";

let mainWindow: BrowserWindow | null = null;
let server: RunningServer | null = null;
let quitting = false;

function createKeystore(userDataPath: string, encryptionAvailable: boolean): Keystore {
  const keyFile = join(userDataPath, "opencode.key");
  let envKey = process.env.OPENCODE_API_KEY?.trim() || null;
  let cached: string | null | undefined;
  let source: KeySource = envKey ? "environment" : "none";

  const read = (): string | null => {
    if (cached !== undefined) return cached;
    if (envKey) {
      cached = envKey;
      source = "environment";
      return cached;
    }
    try {
      if (!encryptionAvailable || !existsSync(keyFile)) {
        cached = null;
        source = "none";
        return null;
      }
      const encoded = readFileSync(keyFile, "utf8").trim();
      if (!encoded) {
        cached = null;
        source = "none";
        return null;
      }
      cached = safeStorage.decryptString(Buffer.from(encoded, "base64"));
      source = "keystore";
      return cached;
    } catch {
      cached = null;
      source = "none";
      return null;
    }
  };

  return {
    get: read,
    set(key) {
      const trimmed = key.trim();
      if (!encryptionAvailable) {
        throw new Error(
          "Operating-system encryption is unavailable; refusing to store the key in plaintext.",
        );
      }
      const encrypted = safeStorage.encryptString(trimmed);
      writeFileSync(keyFile, encrypted.toString("base64"), { encoding: "utf8", mode: 0o600 });
      cached = trimmed;
      envKey = null;
      source = "keystore";
    },
    clear() {
      cached = null;
      envKey = null;
      source = "none";
      rmSync(keyFile, { force: true });
    },
    source() {
      if (envKey) return "environment";
      if (cached) return source;
      read();
      return cached ? source : "none";
    },
  };
}

function registerIpc(): void {
  ipcMain.handle("iwakura:bootstrap", () => {
    if (!server) throw new Error("Local server is not ready");
    return {
      apiBase: server.apiBase,
      token: server.token,
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  });

  ipcMain.handle("iwakura:open-external", async (_event, url: unknown) => {
    if (typeof url !== "string") return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        await shell.openExternal(parsed.toString());
      }
    } catch {
      // Ignore malformed URLs.
    }
  });

  ipcMain.handle("iwakura:quit", () => app.quit());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#080706",
    title: "Iwakura Fantasia",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    mainWindow.webContents.on("console-message", (details) => {
      console.log(`[renderer:${String(details.level)}] ${details.message}`);
    });
    mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
      console.error(`[renderer] failed to load ${url}: ${code} ${description}`);
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error("[renderer] process gone", details);
    });
  }

  const capturePath = process.env.IWAKURA_CAPTURE;
  if (capturePath) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        void mainWindow?.webContents
          .capturePage()
          .then((image) => {
            writeFileSync(capturePath, image.toPNG());
            console.log(`[renderer] captured ${capturePath}`);
          })
          .catch((error) => console.error("capture failed", error));
      }, 2000);
    });
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const route = process.env.IWAKURA_ROUTE;
  if (devUrl) {
    void mainWindow.loadURL(route ? `${devUrl}#${route}` : devUrl);
    if (process.env.IWAKURA_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"), route ? { hash: route } : undefined);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  const userDataPath = app.getPath("userData");
  const encryptionAvailable = await safeStorage.isAsyncEncryptionAvailable().catch(() => false);
  const keystore = createKeystore(userDataPath, encryptionAvailable);
  server = await startServer({
    dbPath: join(userDataPath, "iwakura.db"),
    keystore,
    version: app.getVersion(),
  });
  registerIpc();
}

app.setAppUserModelId("ai.iwakura.fantasia");
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("Failed to start Iwakura Fantasia:", message);
    dialog.showErrorBox("Iwakura Fantasia could not start", message);
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting || !server) return;
  event.preventDefault();
  quitting = true;
  void server
    .close()
    .catch((error) => console.error("Failed to close local server:", error))
    .finally(() => app.quit());
});
