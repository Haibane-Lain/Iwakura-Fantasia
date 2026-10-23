# Iwakura Fantasia

A single-player, hex-based fantasy RPG with a deterministic rules engine and an AI narrative layer.

> The engine owns the rules. The narrator owns the voice. The model proposes; the engine disposes.

**Status:** M0 foundation complete. M1 (hex world) is next.
**Platform:** Windows desktop, Electron.
**Full plan:** [docs/PLAN.md](docs/PLAN.md)

![Iwakura Fantasia main menu](docs/images/main-menu.png)

---

## What works today

- **Electron desktop shell** with a sandboxed renderer, context isolation, preload bridge, and a local-only Hono server.
- **Encrypted key storage** through Electron `safeStorage`. The renderer never sees the OpenCode Go key.
- **SQLite persistence** via Node's built-in `node:sqlite` (WAL mode), with repositories for settings, AI calls, model cache, and campaigns.
- **OpenCode Go gateway** with the `x-opencode-session` header, model catalog, streaming turns, token/cost accounting, and clean provider errors.
- **AI Lab** for exercising the narrator layer: presets, system prompt, temperature, streamed transcript, raw SSE event inspector, and recent-call telemetry.
- **Settings** for provider credentials, per-role model routing, temperature, monthly budget, content rating, difficulty, and UI scale.
- **Local server API** with bearer-token auth, health, settings, model catalog, AI calls, and SSE test turns.
- **Tests**: Vitest for hex/RNG/AI prompt/server routes, and a Playwright Electron smoke test covering navigation, keystore round-trip, and the missing-key error path.
- **Packaged Windows build** via electron-builder (`--dir` smoke test): 1.8 MB `app.asar`, no native modules.

![AI Lab](docs/images/ai-lab.png)

---

## Quick start

**Requirements:** Node 24+, pnpm 10+.

```powershell
pnpm install
pnpm dev
```

Then:

1. Open **Settings → OpenCode Go**.
2. Paste an OpenCode Go API key and choose **Store key**.
3. Open **AI Lab**, choose a model, and send a turn.

Without a key, the app still runs. AI actions return a clear configuration error instead of blocking the UI.

### Development key alternative

For running the server outside Electron:

```powershell
Copy-Item .env.example .env.local
# set OPENCODE_API_KEY in .env.local
pnpm --filter @iwakura/server dev
```

The Electron app reads the OS keystore first, then falls back to `OPENCODE_API_KEY` for development.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Build and launch Electron with Vite HMR. |
| `pnpm build` | Build main, preload, and renderer into `apps/desktop/out`. |
| `pnpm package` | Build and produce an unpacked Windows app in `apps/desktop/release/win-unpacked`. |
| `pnpm test` | Run Vitest unit/integration tests. |
| `pnpm test:e2e` | Build and run the Playwright Electron smoke test. |
| `pnpm typecheck` | Typecheck every workspace package. |
| `pnpm lint` | Run Biome checks. |
| `pnpm format` | Format the repository with Biome. |

---

## Architecture

```
┌──────────────────────────── Electron ────────────────────────────┐
│  Main process                                                    │
│  ├─ window, menu, lifecycle, safeStorage keystore                │
│  ├─ @iwakura/server (Hono on 127.0.0.1, ephemeral port)          │
│  │   ├─ AI gateway (OpenCode Go, SSE, validation, cost logs)     │
│  │   ├─ SQLite (settings, AI calls, model cache, campaigns)      │
│  │   └─ bearer-token auth                                        │
│  └─ loads built renderer in production                           │
│                                                                  │
│  Preload bridge                                                  │
│  └─ API base + per-launch token + app metadata                   │
│                                                                  │
│  Renderer (sandboxed, no Node)                                   │
│  ├─ React 19 UI                                                  │
│  ├─ PixiJS 8 (M1 world renderer)                                 │
│  ├─ game engine package (M1+)                                    │
│  └─ typed API client + SSE                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Workspace packages

| Package | Responsibility |
|---|---|
| `packages/contracts` | Zod schemas and TypeScript types for state, commands, events, AI intents, and API payloads. |
| `packages/engine` | Pure deterministic rules: hex math, A*, LOS, seeded RNG, dice. |
| `packages/content` | Data-driven ancestries, classes, backgrounds, abilities, items, skills. |
| `packages/ai-kit` | NPC prompt assembly, structured parsing, token estimation. |
| `apps/server` | Hono API, SQLite repositories, OpenCode Go adapter, AI gateway. |
| `apps/desktop` | Electron main/preload/renderer shell and the current UI. |

**Dependency rule:** `engine` depends on `contracts` and `content`; `server` depends on `contracts`/`ai-kit`; nothing in `packages/*` imports from `apps/*`.

---

## AI design guardrails

The AI layer is intentionally narrow:

- The model returns narration plus a constrained list of intents.
- The engine validates every intent and applies only what is legal.
- The model never rolls dice, invents stats, or writes directly to state.
- NPC prompts get local knowledge and retrieved memories, not omniscient world state.
- Every AI call is logged with model, tokens, cost, latency, and status.
- Provider failures degrade to a visible error; they never crash the local server.
- A missing key or offline provider leaves the core UI usable.

The streaming implementation consumes the AI SDK `fullStream` and explicitly handles `error` and `abort` parts. That is deliberate: the SDK's text/usage getters can reject with `NoOutputGeneratedError` when a provider fails before sending text, which otherwise surfaces as an unhandled rejection in Node.

---

## Security notes

- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- API server binds only to `127.0.0.1` on an ephemeral port.
- Every API route except `/api/health` requires a per-launch bearer token.
- The API key is encrypted with the OS keystore and never sent to the renderer.
- CSP restricts scripts/styles to self and connections to loopback.
- External links open in the system browser, not inside the app.
- No telemetry, accounts, cloud sync, or remote content.

---

## Current limitations

- The world map, battle map, character creation, and NPC dialogue pipeline are planned for M1–M5. The current build is the foundation and AI workbench.
- `pnpm package` produces an unpacked Windows build; the NSIS installer target is configured but not yet signed or branded with a custom icon.
- A successful live OpenCode Go turn still needs a valid key; the error path and adapter have been verified with an intentionally invalid key.
- OpenCode Go is intended for coding-agent traffic. Treat it as a development/personal provider and keep the adapter swappable before shipping.

---

## Next milestone: M1 — Hex world

- Hex math, A*, LOS, rings and ranges (engine primitives exist).
- Seeded worldgen with the 14 plausibility rules and a world report.
- Handcrafted world pack schema and sample region.
- PixiJS world renderer with camera, chunk baking, and fog.
- Party movement, time, travel encounters, and save/load.
