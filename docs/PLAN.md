# Iwakura Fantasia — Master Plan

**Status:** M3 complete; M4 battle vertical slice in progress
**Last updated:** 2026-10-24
**Target:** Windows desktop, single-player, Electron
**Repository:** `C:\Coding\Iwakura Fantasia`

---

## 1. Vision

A single-player hex-based fantasy RPG with a deterministic rules engine and an AI narrative layer.

Core pillars:

1. **Tactical hex combat** that is readable, fast, and fair.
2. **A world that reacts** — NPCs remember, quests evolve, companions have opinions.
3. **AI as narrator, not referee** — the engine owns all rules and state.
4. **Modular content** — races, classes, abilities, items, quests, and worlds are data.
5. **Playable without AI** — core loops never depend on a model being available.

The AI should make the game feel alive, not make the game work.

---

## 2. Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Platform | Windows desktop first, Electron |
| 2 | Multiplayer | Single-player only |
| 3 | Ruleset | 5e-inspired homebrew |
| 4 | World source | Player chooses handcrafted or procedural at campaign creation |
| 5 | Art | Procedural / vector placeholder now, art pass later |
| 6 | AI provider | OpenCode Go only for v1, behind a provider interface |
| 7 | Scope | Vertical slice first |
| 8 | Tracking | This document |

Out of scope for v1: multiplayer, mobile, mod marketplace, voice acting, cloud saves.

---

## 3. Architecture principles

1. **AI proposes, engine disposes.**
   The model returns narration plus a constrained list of intents. The engine validates preconditions and applies effects. The model never rolls dice, invents stats, or writes directly to state.

2. **Deterministic engine.**
   All randomness comes from a seeded PRNG. Saves store the resulting state and RNG position, not LLM transcripts. Loading a save never re-calls a model.

3. **Data-driven content.**
   Content lives in typed data files with Zod validation. Systems are code; content is data. Hot reload in development.

4. **Local-first.**
   The game runs on the player's machine. No accounts, no telemetry, no remote game server. The only network call is the AI provider.

5. **Provider-agnostic behind one adapter.**
   v1 ships OpenCode Go. The interface allows LM Studio, OpenAI, Anthropic, or others later without touching game logic.

6. **Debuggability is a feature.**
   Command log, event log, AI prompt inspector, intent validator, cost meter, and world validation report from early on.

7. **Graceful degradation.**
   If the AI is unavailable, dialogue falls back to authored lines and UI verbs (Accept, Trade, Attack, Recruit) still work.

---

## 4. Runtime architecture (Electron)

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                  │
│  Main process                                                    │
│  ├─ window + menu + lifecycle + safeStorage                      │
│  ├─ @iwakura/server (Hono, loopback, ephemeral port)             │
│  │   ├─ AI gateway (OpenCode Go, prompts, streaming, validation) │
│  │   ├─ SQLite (saves, memory, transcripts, cost logs)           │
│  │   └─ model catalog + settings                                 │
│  └─ serves built renderer in production                          │
│                                                                  │
│  Preload (contextBridge)                                         │
│  └─ app version, open external links, key status                 │
│                                                                  │
│  Renderer (sandboxed, no Node)                                   │
│  ├─ React 19 UI                                                  │
│  ├─ PixiJS 8 world / battle renderer                             │
│  ├─ Game engine (pure TS) + command/event bus                    │
│  └─ typed API client + SSE                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.1 Process model

- Start with the Hono server inside the Electron main process. AI calls are I/O-bound; SQLite operations are short.
- If profiling shows main-process jank, move the server to `utilityProcess` without changing the API. Keep `createServer()` free of Electron imports.
- World generation runs in a Web Worker in the renderer so the UI never freezes.

### 4.2 Dev vs production

- **Dev:** Electron loads Vite HMR. Server runs in main on a fixed port. `OPENCODE_API_KEY` from `.env.local`.
- **Prod:** Electron loads the built SPA from `out/renderer/index.html`. The renderer receives the loopback API base and a per-launch bearer token through the preload bridge. No cookie, no open port beyond loopback.
- **API key:** entered in Settings, encrypted with `safeStorage`, stored in `userData`. Never logged, never sent to the renderer.
- **CSP:** self-only scripts, loopback connect, data/blob images, no remote content. Dialogue is rendered as escaped text / sanitized markdown.
- **Packaging:** electron-vite for main/preload/renderer, electron-builder for NSIS installer. Native modules (`better-sqlite3`) rebuilt with `@electron/rebuild`; `.node` files unpacked from asar.
- **Updates:** electron-updater after the slice; code signing later.

### 4.3 Security checklist

- [ ] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [ ] Server binds `127.0.0.1` only
- [ ] Per-launch bearer token + cookie
- [ ] Origin check on API routes
- [ ] Zod validation on every request body
- [ ] No LLM-provided code, HTML, SQL, or filesystem paths
- [ ] Save import validated and size-capped
- [ ] Rate limit AI endpoints; hard budget cap
- [ ] No secrets in renderer bundle or logs

---

## 5. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript, strict | Everywhere |
| Monorepo | pnpm workspaces | pnpm 10 already installed |
| Desktop | Electron + electron-vite | electron-builder for NSIS |
| Frontend | React 19 + Vite | electron-vite renderer |
| Map | PixiJS 8 + custom camera | Bake chunks, no per-hex sprites on world map |
| Styling | Tailwind CSS 4 + Radix | Accessible primitives, design tokens |
| UI state | Zustand | UI only; engine state lives outside React |
| Server data | TanStack Query | Model catalog, saves, settings |
| Backend | Node 24 + Hono | SSE, typed RPC, lightweight |
| Validation | Zod 4 | Contracts, saves, AI intents |
| DB | SQLite via `node:sqlite` | Built into Node 24 / Electron 45; WAL; no native rebuilds |
| AI | Vercel AI SDK + `@ai-sdk/openai-compatible` | Streaming, structured output, usage |
| Format / lint | Biome | Formatting, imports, recommended lint rules |
| Tests | Vitest + fast-check + Playwright | Unit, property, Electron E2E |
| Logging | pino (server), custom dev overlay | Per-campaign trace IDs |

Alternatives considered:

- **Godot 4:** better game tooling, worse UI/panel iteration for a CRPG. Rejected.
- **Tauri:** smaller binaries, but requires a Rust toolchain that is not installed. Rejected for v1.
- **Server-authoritative over network:** unnecessary for single-player; adds latency and sync complexity.
- **Full ECS library:** overkill for turn-based play; a typed component store is easier to debug.

---

## 6. Repository layout

```
iwakura-fantasia/
  apps/
    desktop/
      src/
        main/            # Electron main, window, server bootstrap, keystore
        preload/         # contextBridge surface
        renderer/        # React + Pixi game client
          src/
            screens/     # menu, creation, world, town, battle
            components/  # HUD, dialogue, inventory, journal
            canvas/      # Pixi renderers, hex painting, effects
            game/        # engine store, input, orchestration
            api/         # typed client, SSE
      electron.vite.config.ts
      electron-builder.yml
    server/
      src/
        app.ts           # createServer(), routes
        ai/              # providers, prompts, orchestrator, memory
        db/              # schema, repositories, migrations
  packages/
    contracts/           # Zod schemas: state, commands, events, intents
    engine/              # pure deterministic rules
    content/             # races, classes, abilities, items, quests, biomes, worlds
    ai-kit/              # prompt assembly, intent schemas, eval helpers
  tools/
    evals/               # prompt fixtures, live smoke tests
  docs/
    adr/                 # architecture decision records
```

**Dependency rule:**

```
contracts  <- engine <- content
contracts  <- server
contracts  <- ai-kit
desktop/renderer -> engine, content, contracts
desktop/main     -> server
```

Nothing imports from `apps/*` into a package. Enforce with `dependency-cruiser` or ESLint boundaries.

State schemas live in `contracts`; reducers live in `engine`. The server can validate saves without importing game logic.

---

## 7. Core engine

### 7.1 State, commands, events

```ts
dispatch(command) -> validate -> events -> reduce -> notify
```

- **Commands:** player or AI intent, validated against current state.
- **Events:** immutable facts (`EntityMoved`, `DamageApplied`, `QuestStageAdvanced`).
- **Reducers:** pure, deterministic.
- **Subscribers:** UI, audio, quest tracker, Director triggers.

Benefits: replayable saves, testable rules, an audit trail of AI proposals, and a clean migration path to a server-authoritative model if co-op ever happens.

State outline:

```ts
interface GameState {
  version: number;
  campaign: CampaignMeta;
  rng: RngState;
  clock: { day: number; hour: number };
  world: WorldState;
  party: PartyState;
  entities: Record<EntityId, Entity>;
  quests: Record<QuestId, QuestState>;
  factions: Record<FactionId, FactionState>;
  relationships: Record<NpcId, Relationship>;
  flags: Record<string, JsonValue>;
  battle?: BattleState;
}
```

### 7.2 Hex layer

- Axial coordinates `(q, r)`, cube math for distance, rings, lines, LOS.
- Pointy-top hexes; 1 hex = 5 ft for rules, 30 ft speed = 6 hexes.
- Sparse POI map layered over a dense terrain array.
- A* with terrain cost, slope penalty, river-crossing penalty; Dijkstra for range/area.
- Line of sight via cube line traversal with elevation and blocking terrain.
- Vision radius modified by elevation, forest, night, and light.
- Chunked rendering: bake terrain/fog into Pixi `RenderTexture` tiles.

### 7.3 World generation

Two modes, same runtime schema:

**Procedural**
- Seeded fBm simplex elevation, moisture, temperature (latitude + elevation).
- Sea level, coastlines, lakes, river networks.
- Biome table (temperature x moisture x elevation), beaches, snowline.
- Settlement suitability scoring, POI placement, road network.
- Faction territories grown from capitals with cost-limited flood fill.
- Dungeon placement by biome and travel distance.
- Params: seed, world size, sea level, climate, magic level, danger, settlement density.
- Generation in a Web Worker; preview minimap before confirming.

**Handcrafted**
- World pack: `world.json` + map layers + lore + factions + NPCs + quests.
- Same schema and validators as procedural output.
- Sample pack for the vertical slice; editor later.

#### Procedural plausibility rules (hard requirements)

1. Rivers start at high elevation, flow downhill, merge, and terminate at sea or a lake. No uphill flow, no loops.
2. Rivers cross mountains only via an explicit canyon/gap feature.
3. Settlements require fresh water within 3 hexes and arable land within 4.
4. Defensibility bonus for hills, river bends, and coast; no town in deep water or on a bare peak.
5. Towns spaced at least 6 hexes apart; villages at least 3.
6. Every town has a food source and at least one export resource (wood, stone, ore, fish, grain).
7. Ports only on coast with a harbor hex; roads connect each town to its two nearest neighbors.
8. Roads use least-cost paths, bridge rivers at narrow points, and switchback on steep slopes.
9. Dungeons sit in hills/mountains/caves, within travel range of a settlement, entrance on a passable hex.
10. Faction territories are contiguous; borders prefer rivers and mountain ridges.
11. Every settlement is reachable by road or sea from the starting region.
12. No biome adjacency violations without an elevation/climate reason (e.g., snow next to jungle).
13. Climate bands are latitude-consistent; rain shadows are optional but must be coherent.
14. POIs use Poisson-disk spacing and are visible/reachable from a road or landmark.

A **world report** runs after generation:

- errors block confirmation (e.g., unreachable town, river loop)
- warnings allow confirmation (e.g., isolated hamlet, long road)
- repair pass attempts fixes (move POI, add bridge, reroute road) before regenerating with the next seed

### 7.4 Local maps (towns and dungeons)

- Reuse the same renderer and hex math at a smaller scale.
- **Town:** 15x15 to 25x25 local map, buildings, NPCs with schedules, exits.
- **Dungeon:** 20x20 to 40x40, fog, rooms/corridors, encounter triggers, loot, boss room.
- **Interiors:** simple scene panels, not full maps, unless the location matters tactically.
- Entering/leaving a local map is a command; state serializes into the save.

### 7.5 Battle maps

When combat starts:

1. Read the current world hex and its six neighbors.
2. Choose arena size: 9x9 skirmish, 11x11 standard, 13x13 boss/siege.
3. Sample terrain weights from the neighborhood (forest, rock, water, elevation).
4. Generate a seeded tactical layout with deployment zones, lanes, and chokepoints.
5. Place cover, elevation, hazards, and objectives consistent with the world hex.
6. Party deploys on one edge; enemies on the opposite edge or ambush positions.
7. Serialize `BattleState` into the save.

Battle features:

- Initiative order, surprise round, turn/round tracking.
- Movement, action, bonus action, reaction (opportunity attacks only at launch).
- Ability targeting: single, cone, line, burst, self, aura.
- Cover, elevation, flanking (+2), difficult terrain, hazards.
- Objectives: defeat, survive N rounds, escape, protect, hold point.
- Retreat: leave via map edge; pursuit check; consequences.
- Victory/defeat rewards and consequences applied through the engine.

### 7.6 Time and off-screen simulation

- Clock: watches/hours/days; day/night affects vision, schedules, encounters.
- NPC schedules are coarse (home, work, tavern, sleep); no full pathfinding off-screen.
- Travel consumes time and triggers checks/encounters.
- Rest triggers Director beats, companion banter, and world events.
- Faction and settlement state tick on day boundaries.

---

## 8. Ruleset — 5e-inspired homebrew

### 8.1 Attributes

STR, DEX, CON, INT, WIS, CHA.

- Modifier = `floor((score - 10) / 2)`.
- Creation: point buy 27 (scores 8–15 before ancestry), standard array, or seeded 4d6-drop-lowest.
- Ancestry grants fixed +2 / +1 (revisit floating bonuses after playtesting).

### 8.2 Ancestry, background, class

**Ancestries (vertical slice):** Human, Elf, Dwarf.
**Ancestries (v1):** + Orc, Beastkin, Halfling.

Each ancestry grants:
- attribute bonuses
- 1–2 traits (darkvision, resilience, extra skill, movement, etc.)
- a cultural hook
- appearance options for the procedural paper doll

**Backgrounds (slice):** Soldier, Scholar, Outlander.
**Backgrounds (v1):** + Criminal, Acolyte, Merchant, Noble.

Each background grants:
- 2 skill proficiencies
- a tool/language or lore specialty
- starting equipment
- a story hook the Director can use

**Classes (slice):** Fighter, Rogue, Wizard.
**Classes (v1):** + Cleric, Ranger, Warlock, Bard, Paladin.

Each class grants:
- hit die, primary attributes, saves
- armor/weapon proficiencies
- starting kit
- 3–5 abilities at level 1, scaling to level 10
- one subclass at level 3 (v1)
- resource name: Focus (Mana / Stamina / Zeal by class)

No multiclassing in v1. Level cap 10 in v1; 20 later.

### 8.3 Skills and checks

18 standard skills. Check = `d20 + attribute mod + proficiency (if proficient) + situational modifiers` vs DC.

- Advantage/disadvantage: roll 2d20, keep higher/lower.
- Passive score = 10 + modifier.
- Group checks, opposed checks, and extended checks supported by the engine.
- DC bands: 5 trivial, 10 easy, 15 medium, 20 hard, 25 very hard, 30 legendary.

### 8.4 Action economy

Per turn:

- Movement: 6 hexes (30 ft), modified by ancestry/terrain.
- 1 Action.
- 1 Bonus Action.
- 1 Reaction (opportunity attack, readied action later).
- 1 free object interaction.

### 8.5 Combat math

- Attack: `d20 + attribute + proficiency` vs AC.
- Critical hit on natural 20: double damage dice, add modifiers once.
- Natural 1: automatic miss.
- Damage: dice + modifier; resistances halve, vulnerabilities double, immunities negate.
- Save DC: `8 + proficiency + attribute`.
- AC: light `11 + DEX`, medium `13 + min(DEX, 2)`, heavy `16`; shield +2.
- Cover: half +2 AC/DEX saves, three-quarters +5, full blocks targeting.
- High ground: +2 to ranged attacks against lower targets.
- Flanking: +2 to melee attacks when an ally is opposite (optional rule, on by default).
- Surprise: surprised creatures skip their first turn.

### 8.6 Conditions

Blinded, charmed, frightened, grappled, incapacitated, poisoned, prone, slowed, stunned, burning, bleeding, hidden.

Each condition is a data-defined modifier set with duration and stacking rules. Keep the list small and test every one.

### 8.7 Resources, rest, death

- **Focus** is the universal ability resource; UI label is class-specific. Max scales with class, level, and primary attribute.
- Abilities cost Focus, have cooldowns, or have charges. No Vancian spell slots.
- Short rest (1 hour): spend hit dice, regain 50% Focus.
- Long rest (8 hours): full HP, full Focus, advance day.
- 0 HP: unconscious, death saves at the start of each turn (10+ success, 3 successes stabilize, 3 failures die).
- Healing at 0 HP revives. Massive damage instant death is optional.

### 8.8 Equipment and economy

- Slots: main hand, off hand, armor, accessory x2.
- Inventory: category slots with stack sizes; optional encumbrance off by default.
- Weapons: damage dice, damage type, properties (reach, finesse, two-handed, thrown).
- Armor: light/medium/heavy, AC formula, stealth penalty.
- Consumables: potions, scrolls, food, tools.
- Currency: gold; prices in content; merchants use stock tables.
- Haggle: Persuasion/Intimidation check modifies price within engine-set bounds (never more than ±30%).

### 8.9 Progression

- Milestone leveling for the narrative campaign (XP mode optional later).
- ASI or feat at levels 4, 8, and 10; 8 feats in v1.
- Companions scale with the party, not separate XP.
- Loot budget by level band enforced by the engine.

### 8.10 Character creation flow

1. World/campaign settings (before or after creation).
2. Ancestry.
3. Class.
4. Background.
5. Attributes (point buy / array / roll).
6. Skills and expertise.
7. Appearance (procedural portrait, palette, sigil).
8. Name, pronouns, voice/blurb.
9. Preview derived stats.
10. Confirm and start.

Derived preview: HP, AC, initiative, speed, Focus, saves, skills, attack bonuses, carry.

All choices reference content IDs. Only the name is free text (sanitized, length-capped).

Character creation is itself a pure state machine in `engine`, so it can be tested without UI.

---

## 9. AI subsystem

### 9.1 OpenCode Go provider

- Base URL: `https://opencode.ai/inference/go/openai/v1`
- Chat completions: `/chat/completions`
- Model catalog: `https://opencode.ai/inference/go/v1/models`
- Headers:
  - `Authorization: Bearer <OPENCODE_API_KEY>`
  - `x-opencode-session: <campaignId>:<npcId>` — stable per conversation
  - `User-Agent: iwakura-fantasia/<version>`

v1 supports only OpenAI-compatible chat models on Go:

- `deepseek-v4.1-flash`
- `deepseek-v4-pro`
- `glm-5.3-flash`
- `glm-5.3`
- `mimo-v2.6-flash`
- `longcat-2.0`
- `minimax-m3.1-flash`

Models served over Anthropic/OpenAI/Google-specific endpoints are out of scope until a second adapter exists.

```ts
const model = opencodeGo("deepseek-v4.1-flash");

const result = await streamObject({
  model,
  headers: {
    Authorization: `Bearer ${getApiKey()}`,
    "x-opencode-session": `${campaignId}:${npcId}`,
    "User-Agent": `iwakura-fantasia/${appVersion}`,
  },
  schema: NpcTurnSchema,
  system: assembledPrompt,
  messages: transcript,
});
```

The provider interface:

```ts
interface LlmProvider {
  id: string;
  listModels(): Promise<ModelInfo[]>;
  streamTurn(req: TurnRequest): AsyncIterable<TurnChunk>;
}
```

Concrete implementation wraps the AI SDK. Swapping providers is a config change, not a game change.

### 9.2 Model roles

| Role | Default model | Why |
|---|---|---|
| NPC dialogue | `deepseek-v4.1-flash` | Cheap, fast, large context |
| Dialogue repair / classifier | `glm-5.3-flash` | Cheap structured output |
| Director / quest evolution | `deepseek-v4-pro` | Better long-form coherence |
| Summarizer | `glm-5.3-flash` | Short, frequent, cheap |
| Fallback | same role's alternate model | Graceful failure |

Benchmark latency in M5. Dialogue models must respond in under ~2.5s to first token. If reasoning latency is too high, expose a reasoning-effort setting and test GLM Flash for NPC turns.

All roles are configurable in Settings, with per-role model pickers and a "Test" button.

### 9.3 NPC turn pipeline

```
Player input (text or selected verb)
  -> client builds ScenePacket
     npcId, location, nearby entities, relationship, quest flags,
     inventory summary, known facts, retrieved memories, last 10 turns
  -> POST /api/ai/npc-turn (SSE)
  -> server assembles prompt (stable prefix + dynamic scene)
  -> model streams structured object:
     { speech, emotion, intents[], memoryWrites[] }
  -> Zod validation; one repair retry; text-only fallback
  -> server streams speech, then final validated payload
  -> client applies intents through engine.dispatch()
  -> engine accepts/rejects; UI narrates outcome
  -> transcript + memory writes persisted
```

If the engine rejects an intent, the UI shows an in-character refusal ("I don't have that to give"). Optionally send one continuation call with the rejection context so the NPC responds naturally, but never loop more than once.

**NPC-initiated hostility** is normally rules-driven (faction hostility, alarm, ambush). The LLM may escalate a conversation to combat via `start_combat`, but it cannot spawn arbitrary enemies — the engine spawns from the encounter table for that location.

### 9.4 Intent vocabulary

NPC intents (validated and precondition-checked):

- `adjust_disposition` — trust, affection, respect, fear; delta capped at ±10
- `remember` — fact + importance
- `offer_quest` — template ID + hook text
- `complete_quest` — quest ID (only if objectives met)
- `open_trade` — merchant flag required
- `give_item` — item must exist in NPC inventory
- `demand_item` — item must exist in player inventory
- `offer_recruitment` — recruitable flag + wage bounds
- `dismiss_companion`
- `start_combat` — reason; engine spawns local encounter
- `flee` — NPC leaves the scene
- `surrender`
- `call_for_help`
- `set_meeting` — time + location
- `mark_location` — map POI reveal

Director-only intents (separate schema and allowlist):

- `create_quest_from_template`
- `advance_quest_stage`
- `add_objective`
- `branch_quest`
- `spawn_encounter`
- `change_faction_relation`
- `reveal_rumor`
- `advance_clock`
- `schedule_world_event`

Rules:

- Max 3 intents per NPC turn.
- No raw numbers for damage, HP, gold, XP, or item stats.
- Every referenced ID must exist in content and pass engine preconditions.
- Invalid intents are dropped and logged, never applied partially.

Example schema (abridged):

```ts
const NpcTurnSchema = z.object({
  speech: z.string().max(1200),
  emotion: z.enum(["neutral", "friendly", "wary", "angry", "afraid", "sad", "amused"]),
  intents: z.array(z.discriminatedUnion("type", [
    z.object({
      type: z.literal("adjust_disposition"),
      axis: z.enum(["trust", "affection", "respect", "fear"]),
      delta: z.number().int().min(-10).max(10),
      reason: z.string().max(200),
    }),
    z.object({ type: z.literal("offer_quest"), templateId: z.string(), hook: z.string().max(400) }),
    z.object({ type: z.literal("open_trade") }),
    z.object({ type: z.literal("offer_recruitment"), wage: z.number().int().min(0).max(500) }),
    z.object({ type: z.literal("give_item"), itemId: z.string(), quantity: z.number().int().min(1).max(5) }),
    z.object({ type: z.literal("remember"), fact: z.string().max(300), importance: z.number().min(0).max(1) }),
  ])).max(3),
  memoryWrites: z.array(z.object({ text: z.string().max(300), importance: z.number().min(0).max(1) })).max(2).default([]),
});
```

### 9.5 Director (evolving quests / AI game master)

Triggers: travel to a new hex, rest, quest stage completion, combat end, major NPC action, day boundary.

Input: condensed world state, active quests, unresolved hooks, faction reputation, recent choices, party composition, location context.

Output: one scene beat plus optional validated operations. The Director cannot free-write the world; it selects from authored templates and fills prose slots.

**Quest model:**

- Authored templates with slots: giver, target, location, complication, reward.
- Each quest is a state machine: stages, objectives, branches, flags, deadlines.
- Objective types: reach, interact, kill, collect, escort, survive, choice, timer.
- Director may advance a stage, add an objective, or branch within allowed transitions.
- Rewards are constrained by level band and item pool.
- Max 3 active quests; cooldown after combat; no new quest in the same scene it was completed.

This hybrid keeps quests coherent for a long campaign while letting the AI write connective tissue and react to player choices.

**Improvise action (stretch, after slice):** a text action bar outside dialogue. The model maps the action to a skill check or engine command; the engine rolls and resolves. Never let it directly apply damage or loot.

### 9.6 Memory

SQLite tables:

- `npc_memory` — campaign, NPC, kind, text, importance, source event, timestamps.
- `npc_relationship` — trust, affection, respect, fear, last updated.
- `conversation_turn` — campaign, NPC, role, content, tokens, timestamp.
- `conversation_summary` — rolling summary + through-turn marker.
- `ai_call` — role, model, prompt hash, tokens, cost, latency, status.

Retrieval (v1): FTS5 keyword match + recency + importance, top 8. Add local embeddings later only if quality demands it.

NPC knowledge boundaries: an NPC only receives local facts, their own memories, rumors they could plausibly know, and public world state. Never the full global state.

Contradictions: newest verified fact wins; conflicting memories are flagged in the debug view.

### 9.7 Prompt structure

Ordered static → dynamic for prompt caching:

1. System: game rules summary, tone, safety, output contract (stable).
2. World lore excerpt (semi-static per region).
3. NPC persona card: identity, voice, goals, fears, secrets, knowledge, sample lines (stable).
4. Relationship + known facts (dynamic).
5. Scene packet: location, time, nearby entities, quest state (dynamic).
6. Retrieved memories (dynamic).
7. Last 10 transcript turns (dynamic).
8. Task instruction + schema reminder.

Prompts live in `apps/server/src/ai/prompts/*.md` with frontmatter and version hashes. Prompt changes are code-reviewed and snapshot-tested.

### 9.8 Fallbacks and guardrails

- Schema validation with one repair attempt; then text-only response (no state changes).
- If the provider is down: authored fallback lines per NPC archetype; UI verbs still work.
- Timeouts: 20s NPC turn, 60s Director. One retry, then fallback.
- Circuit breaker after repeated failures; surface a clear "AI offline" indicator.
- Prompt-injection defense: player text and retrieved memories are delimited data, never system instructions.
- Per-NPC intent allowlist by archetype.
- No HTML, code, SQL, or file paths in outputs. Sanitize markdown.
- Content settings gate romance/violence intensity.
- Log every call; allow viewing and deleting transcripts.
- No telemetry.

### 9.9 Budget and cost

- Per-campaign soft budget and global hard cap, configurable in Settings.
- Live cost meter in the AI panel.
- Context caps: 32k tokens for NPC turns, 64k for Director, regardless of model maximum.
- Summarize conversations every 20 turns.
- Cache stable prefixes; keep the session header stable.
- Prefer cheap models for summaries, repairs, and classification.
- Hard stop at the cap with an in-game explanation; game remains playable.

### 9.10 AI debug panel (build in M0)

- Assembled prompt, with secrets redacted.
- Raw model response and parse errors.
- Validated intents and engine acceptance/rejection.
- Token usage, cost, latency, model.
- Replay turn with a different model/temperature.
- Prompt version hash.
- Memory inspector per NPC.

This panel is the difference between tuning the AI in days and guessing for weeks.

### 9.11 AI evals

- Fixture scenes per NPC archetype.
- Schema validity rate target: >99% after repair.
- Forbidden-intent tests: give item not owned, recruit at low disposition, quest reward out of band, combat with no hostiles.
- Prompt regression snapshots.
- Live smoke test against Go, opt-in, tiny prompt.
- Record real transcripts for replay; strip keys and personal data.

---

## 10. Content systems

### 10.1 Content types

- Ancestries, backgrounds, classes, subclasses.
- Abilities, spells, conditions, feats.
- Items, weapons, armor, consumables, loot tables.
- Bestiary and encounter tables.
- NPC archetypes, persona cards, schedules, merchant stock.
- Quest templates, world events, rumors.
- Biomes, POI templates, worldgen presets.
- Handcrafted world packs.
- UI strings and lore glossary.

### 10.2 Format

- TypeScript objects for engine-adjacent content (type-safe, HMR).
- JSON for world packs and large data.
- Zod schemas in `contracts`; validation at load and in CI.
- Manifest with content version; save stores the version.
- IDs are stable, namespaced strings (`core:longsword`, `wslice:town_mill`).

### 10.3 Content pipeline

- Loader validates all content at startup; errors are actionable.
- Dev: hot reload and a content inspector.
- CI: `pnpm validate:content` fails on broken references, duplicate IDs, missing icons, out-of-band stats.
- Mods: directory loading with manifest + validation after v1. No arbitrary JS execution initially.

---

## 11. GUI

### 11.1 Visual direction (placeholder)

- Parchment/ink vector aesthetic: warm off-white, charcoal ink, muted jewel accents.
- Hex tiles drawn with Pixi Graphics + subtle noise; no external art required.
- Unit tokens: colored disc + sigil/initial + faction ring; portraits as procedural layered silhouettes.
- Icon set: game-icons.net (CC-BY) + custom SVGs.
- Typography: serif for prose and titles, sans for UI; local variable fonts.
- Design tokens in CSS variables so the art pass is a skin change, not a rewrite.

### 11.2 Screens

1. **Boot / splash** — logo, version, loading.
2. **Main menu** — Continue, New Campaign, Load, Settings, Credits, Quit.
3. **New campaign** — world source (handcrafted/procedural), seed, size, climate, danger, settlement density, difficulty, content rating, AI settings; procedural preview + world report.
4. **Character creation** — 10-step wizard, live preview, reroll/seed.
5. **World map** — party token, fog, POIs, travel path, time, gold, region name.
6. **Town** — local map, buildings, NPCs, schedules, exits.
7. **Dungeon** — local map, fog, encounters, loot, boss.
8. **Battle** — initiative tracker, action bar, hex targeting, combat log, retreat.
9. **Dialogue** — portrait, streamed text, emotion, action chips, free-text input, disposition indicator.
10. **Panels** — character sheet, inventory/equipment, journal/quests, party/companions, world map, settings.
11. **Save/load** — slots with portraits, location, playtime, timestamp.
12. **AI debug** — dev toggle.

### 11.3 Layout

- World: top status bar, left party rail, bottom action bar, right contextual panel.
- Battle: top initiative, bottom action bar, center hex grid, right combat log.
- Dialogue: bottom overlay with portrait, text, input, and verbs; world remains visible.
- Panels slide over the world; Esc closes; focus trapping via Radix.
- Responsive down to 1280x720; scale UI independently of canvas.

### 11.4 Controls

- Mouse: click to move/select/target; right-click cancel/context.
- Keyboard: WASD/arrows pan or move, I inventory, J journal, C character, M map, Tab cycle party, Space end turn, Enter send, Esc close.
- Touch: tap/gesture support for basic play.
- Remapping in Settings; controller later.

### 11.5 Accessibility

- UI scale 80–150%.
- Colorblind-safe palettes and redundant icons/shapes.
- Reduced motion mode.
- Screen-reader descriptions for hex contents and battle state.
- Adjustable text speed, dialogue font size, and subtitle background.
- Content toggles for gore/romance intensity.

### 11.6 Art pass later

All placeholder assets are isolated in `apps/desktop/src/renderer/src/canvas/assets` and content `iconId` fields. Replacing them must not require rule or AI changes.

---

## 12. Persistence and saves

### 12.1 SQLite schema

- `campaign` — id, name, world source, seed/params or pack ID, settings, created/updated.
- `save` — campaign id, slot, label, version, compressed state JSON, screenshot, playtime.
- `event_log` — campaign id, seq, type, payload (optional; useful for replay/debug).
- `npc_memory`, `npc_relationship`, `conversation_turn`, `conversation_summary`.
- `ai_call` — cost/latency/status logs.
- `setting` — key/value.
- `model_cache` — catalog + timestamp.

Use WAL mode, foreign keys on, and prepared statements. Keep the DB in Electron `userData`.

### 12.2 Save format

```ts
interface SaveFile {
  version: number;
  meta: { name, worldSource, playtime, createdAt, screenshot? };
  state: GameState;
}
```

- Manual slots: 10.
- Autosave ring: 3.
- Autosave on scene transitions and every 20 significant events.
- Compress large state (gzip) before storing.
- Export/import `.iwakura` (zip: save JSON + metadata + optional screenshot).
- Versioned migrations from day one; never load an unknown newer version.
- Loading never re-calls the LLM.

### 12.3 Crash safety

- Atomic writes via temp file + rename for exports.
- SQLite WAL + transactions.
- On startup, detect a dirty autosave and offer recovery.

---

## 13. Testing and quality

### 13.1 Unit and property tests

- Hex distance symmetry, neighbor/ring correctness, LOS edge cases.
- Pathfinding cost monotonicity, no paths through impassable terrain.
- Combat invariants: no HP above max, no negative Focus, action economy enforced.
- Damage/condition/resistance interactions.
- Character creation point-buy totals and derived stats.
- Quest state machine transitions and objective tracking.
- Worldgen validators: every generated seed in a 100-seed test passes all hard rules.
- Save/load round-trip equality.

### 13.2 Integration

- API routes with Zod validation.
- AI intent validation with a mock provider.
- Save migration fixtures.
- Model catalog cache.

### 13.3 E2E

Playwright launches Electron and runs the slice flow:

1. Create profile.
2. New campaign.
3. Create character.
4. Move on world map.
5. Enter town.
6. Talk to NPC (mock AI).
7. Accept quest.
8. Enter battle and win.
9. Save, quit, reload.
10. Verify state.

### 13.4 Performance budgets

- Worldgen for slice size: <2s in a worker.
- Map pan/zoom: 60fps at 1080p.
- Battle command resolution: <50ms.
- NPC first token: <2.5s target, 20s timeout.
- App cold start: <5s.

### 13.5 CI

- Windows GitHub Actions: install, typecheck, lint, unit tests, content validation, build.
- Playwright E2E on PRs (headless Electron).
- AI evals with mock provider on every PR; live smoke weekly/manual.
- Packaging job on tags.

---

## 14. Milestones

Status: `[ ]` not started, `[~]` in progress, `[x]` done.

### M0 — Foundation

- [x] Initialize git repo, pnpm workspace, TypeScript strict, Biome.
- [x] `contracts` package with core state, command, event, AI intent, and API schemas.
- [x] `@iwakura/server` with Hono, health route, config, graceful shutdown.
- [x] Electron shell: main/preload/renderer, dev HMR, production loading.
- [x] Loopback bearer-token auth, CSP, CORS, sandboxed renderer.
- [x] SQLite via `node:sqlite`, schema, repositories, WAL mode (Drizzle deferred).
- [x] Key storage via `safeStorage`; settings screen for the key; E2E round-trip.
- [x] OpenCode Go adapter: model catalog, streaming turns, usage/cost logging, session header.
- [x] SSE streaming end-to-end (error path verified with an invalid key; success needs a real key).
- [x] AI debug panel v0: event stream, recent calls, tokens, cost, latency.
- [x] Base UI shell, design tokens, screen router, main menu, AI Lab, settings, world-source placeholder.
- [x] Vitest + Playwright Electron smoke test (navigation, keystore round-trip, missing-key UI).
- [x] electron-builder packaging smoke test (unpacked Windows build, ~4 MB `app.asar` after Pixi and character assets).
- [ ] Live acceptance: enter a valid OpenCode Go key, stream a test turn, verify usage and cost.

**Exit:** packaged app launches; all checks pass except the live-key acceptance turn.

### M1 — Hex world

- [x] Hex math, A*, LOS, ranges, rings.
- [x] Seeded worldgen with plausibility validators + report.
- [x] Handcrafted world schema + sample pack (Redford Reach).
- [x] World preview/reroll UI with a Web Worker generator and a 2D preview.
- [x] PixiJS world renderer, pan/zoom camera, fog, labels, path preview, party token.
- [x] Party token, click-to-travel, time advancement, terrain-aware road network, encounter stub.
- [x] Save/load of world, fog, discoveries, and party position via the campaign API.
- [x] Vitest worldgen/travel/validation coverage and a Playwright world creation/travel/save E2E.

**Exit:** explore a generated or handcrafted region, save/reload. Achieved in the E2E.

**M1 notes:**
- Terrain is rendered in batched PixiJS Graphics layers rather than baked chunk textures. Chunk baking is deferred until larger maps or profiling require it.
- The procedural generator validates core rules (land fraction, settlements, water access, spacing, road connectivity, river exits, POI placement, dungeon terrain). Ports, faction territories, resource economies, rain shadows, and full climate-band validation are deferred to M3.
- There is no automatic repair pass yet; rerolling the seed is the repair path.
- Handcrafted roads currently use the same A* network builder as procedural worlds. Authored road paths are in the schema but not used by the sample pack.
- The world setup screen auto-generates a small procedural preview on first visit, then regenerates on demand.
- The renderer imports `pixi.js/unsafe-eval` to install Pixi's CSP-safe polyfills; the CSP itself remains strict (no `unsafe-eval`).

### M2 — Character and content

- [x] Content validation tests and Vite HMR for in-repo TS content. External world-pack hot reload is deferred.
- [x] Ancestries: Human, Elf, Dwarf, with bonuses, traits, granted skills, and extra skill choices.
- [x] Classes: Fighter, Rogue, Wizard, with hit die, saves, Focus, skill choices, and starting kits.
- [x] Backgrounds: Soldier, Scholar, Outlander, with skills, hooks, and starting items.
- [x] Character creation wizard + live derived preview.
- [x] Inventory, equipment, character sheet, and equip/unequip actions.
- [x] Skills/checks UI with deterministic rolls that advance the campaign RNG.
- [x] Procedural portrait and sigil from a seed/palette.

**Exit:** create a character, equip gear, see correct stats. Achieved in the E2E.

**M2 notes:**
- Attribute modes: 27-point buy, standard array assignment, and rolled 4d6-drop-lowest auto-assigned by class priority.
- Class skill choices exclude skills already granted by background or ancestry. Human gets one extra skill choice.
- The starting kit combines background and class items, deduplicates them, and auto-equips the first weapon and armor.
- AC derives from armor type and Dexterity; HP from class hit die and Constitution; Focus from class base plus the best primary attribute modifier.
- The character sheet supports Overview, Inventory, and Skills tabs, equip/unequip, and per-skill d20 rolls. Rolls persist the updated RNG cursor with the campaign.
- Portraits and sigils are pure SVG, seeded by the character appearance, so there is no external art dependency.
- Old M1 saves load fine: new entity fields have schema defaults and the sheet supplies a fallback appearance.
- Not yet implemented: subclasses, feats, level-up UI, tool proficiencies, expertise, and manual rolled-stat assignment.

### M3 — Towns, NPCs, quests

- [x] Town local map, buildings, exits.
- [x] NPC entities, schedules, interaction prompts.
- [x] Dialogue panel with authored fallback lines.
- [x] Merchant UI, buy/sell.
- [x] Quest journal, authored quest state machine.
- [x] Dungeon local map + entrance transition.

**Exit:** walk into town, talk, trade, accept a quest, enter a dungeon. Achieved in the E2E.

**M3 notes:**
- Local maps use the same hex geometry and pathfinding as the world map, with a dedicated PixiJS local renderer for tiles, building doors, exits, interactables, NPCs, and hover paths.
- Redford, Millbrook, and the Old Mill Crypt are authored maps. Procedural settlements and dungeons fall back to generic settlement/dungeon layouts; procedural towns include a generic road trader, Sable.
- Seven authored NPCs have hour-granular schedules, roles, portraits, personas, and authored dialogue. Presence is derived from the campaign clock and local map spots.
- Dialogue roots react to quest state (`default`, `questAvailable`, `questActive`, `questReady`, `questComplete`). Options can accept/claim quests, open shops, adjust relationships, wait, or end.
- The free-speech AI hook assembles an NPC persona prompt with relationship, scene, and transcript, then streams an in-character reply through the local AI gateway. Only speech is shown; intent validation and state mutation remain M5.
- Two authored quests: **The Mill That Stopped** and **The Greywatch Light**. Quest acceptance reveals reach targets on the world map; reach/interact objectives progress on travel, local entry, and interactions; turn-in grants gold and items.
- The market tracks per-campaign stock. Buy/sell validates gold, stock, inventory, and equipped items, and updates the save.
- Local time can be advanced with wait controls or an inn rest. Inn rest costs 1 gp and restores HP/Focus.
- Dungeon encounter triggers set a persistent flag and show a warning; tactical resolution is M4.
- Not yet implemented: enterable building interiors, minute-granular schedules, NPC pathing, crimes/reputation, branching quests, and quest templates.

### M4 — Battle (vertical slice)

- [x] Battle map generation from the current local map or world terrain.
- [x] Initiative, rounds, turn order, movement, attacks, focus costs, and enemy turns.
- [~] Abilities, conditions, cover, elevation, LOS. Abilities, shield condition, and LOS are implemented; cover/elevation are deferred.
- [x] Enemy utility AI: close distance and attack adjacent targets.
- [ ] Companion combat AI + player override.
- [x] Victory/defeat/retreat, basic rewards, consequences, and saved battle state.
- [x] Battle UI and combat log. Animations and damage previews are deferred.

**Exit:** fight two encounters with abilities and retreat from one. Partially achieved: dungeon battle, abilities, enemy turns, retreat, and victory rewards are covered by tests; the E2E fights and retreats once.

**M4 notes:**
- Battle maps reuse the local hex renderer. Dungeon fights use the current local map with building/exit/interactable markers stripped; road fights generate a small arena from the current world terrain.
- Turn order is d20 + Dexterity or enemy initiative bonus. The active unit has movement equal to speed and one action. Enemy turns are resolved explicitly from the UI.
- Player attacks use proficiency + Strength, equipped weapon damage, critical hits, and AC. Enemies use authored attack bonus, damage dice, and range.
- Implemented abilities: Power Strike, Sneak Attack, Firebolt (range + LOS), Shield (+5 AC condition), Second Wind, and Cunning Action.
- Enemy AI closes distance and attacks when adjacent; it does not use cover, flanking, or abilities yet.
- Victory grants enemy gold; defeat costs 10 gp and leaves the party at 1 hp; retreat returns to the previous local/world state. Battle state persists in the campaign save.
- Not yet implemented: companion turns, cover, elevation, full condition durations, attack animations, damage previews, and a second battle in the E2E.

### M5 — AI NPCs

- [ ] OpenCode Go streaming structured turns.
- [ ] NPC prompt assembly + persona cards.
- [ ] Intent schema + validation + repair + fallback.
- [ ] Memory, summaries, FTS retrieval.
- [ ] Disposition changes, trade, recruit, combat triggers.
- [ ] AI offline fallback mode.
- [ ] AI debug panel v1.
- [ ] Eval fixtures + forbidden-intent tests.
- [ ] Cost meter and budget cap.

**Exit:** hold a natural conversation, insult an NPC, recruit a companion, get threatened.

### M6 — Director, evolving quests, companions

- [ ] Quest templates + slot filling.
- [ ] Director triggers and operation validation.
- [ ] Branching quest stages and world reactions.
- [ ] Companion approval, banter, morale, leaving.
- [ ] Romance gates and content settings.
- [ ] Rumor/faction reactions.
- [ ] Quest recap writer.

**Exit:** a quest changes based on a choice; a companion reacts to approval.

### M7 — Vertical slice polish

- [ ] Save slots, autosave, export/import.
- [ ] Settings: audio, display, accessibility, AI, content.
- [ ] Onboarding and tooltips.
- [ ] Audio pass and VFX.
- [ ] Performance pass.
- [ ] Accessibility pass.
- [ ] Windows installer, icon, version metadata.
- [ ] Slice acceptance test documented and passing.

---

## 15. Vertical slice definition

**Content scope**

- 1 handcrafted region + 1 procedural preset.
- 1 town with 5 named NPCs, 1 merchant, 1 recruitable companion.
- 1 dungeon with 3 encounters and 1 boss.
- 3 ancestries, 3 classes, 3 backgrounds.
- 2 enemy types + 1 boss.
- 1 main quest with 3 stages and 2 outcomes; 1 side quest.
- 1 trade interaction, 1 recruitment, 1 romance hook.
- 1 companion with combat AI and camp banter.

**Acceptance criteria**

- [ ] Launch the packaged Electron app on a clean Windows profile.
- [ ] Create a character with point buy and see correct derived stats.
- [ ] Start both a handcrafted and a procedural campaign.
- [ ] Procedural world report shows zero hard-rule errors.
- [ ] Explore the world, enter the town, talk to 3 NPCs with streamed AI responses.
- [ ] Insult an NPC and observe a disposition change.
- [ ] Trade with the merchant; prices respect engine bounds.
- [ ] Recruit the companion; they fight in battle and comment at camp.
- [ ] Accept and complete the main quest's first two stages.
- [ ] Win a battle, lose/retreat from another, and return to the world map.
- [ ] Save, quit, relaunch, and load with identical state.
- [ ] Disconnect the AI provider mid-game; core verbs and fallback dialogue still work.
- [ ] AI panel shows prompt, response, intents, latency, and cost for every call.
- [ ] World map holds 60fps; battle resolves commands in under 50ms.
- [ ] No secrets in renderer bundle or logs.

---

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OpenCode Go is intended for coding-agent traffic | Account/ToS risk if used as a game backend | Keep provider abstraction; personal/dev use; be ready to switch providers |
| AI latency breaks conversation flow | Feels sluggish | Stream speech, use fast models, benchmark, cache prefixes |
| AI cost grows | Unsustainable | Context caps, summaries, cheap models, budget meter |
| LLM invents items/quests/stats | Broken game state | Constrained intents, engine validation, content ID references |
| Prompt injection via player text | NPC misbehavior / state abuse | Delimited data, allowlists, no direct state writes |
| Procedural worlds feel random | Immersion loss | Hard plausibility rules, validation report, repair pass, handcrafted option |
| Native SQLite module packaging | Build failures | `@electron/rebuild`, asarUnpack, CI packaging smoke test |
| Scope creep | Never ships | Vertical slice gate, content budget per milestone |
| Rules balance | Combat unfun | Data-driven tuning, simulation tests, playtesting |
| Save incompatibility | Lost progress | Versioned saves + migrations from day one |
| Electron security | Local compromise | Sandbox, context isolation, CSP, loopback token, no remote content |
| AI downtime | Game blocked | Fallback lines + UI verbs; core loop never depends on AI |

---

## 17. Deferred decisions

Revisit after the slice:

- Content rating: default PG-13, mature toggle for gore/romance.
- Difficulty modes and permadeath.
- XP vs milestone leveling (milestone default).
- Level cap: 10 for v1, 20 later.
- Subclass design and feat list.
- Floating vs fixed ancestry bonuses.
- Voice/TTS.
- Mod support and world-pack editor.
- Localization.
- Controller support.
- Auto-update and code signing.
- Second AI provider (LM Studio/OpenAI/Anthropic).
- Embeddings for memory.
- Free-form "improvise action" bar.
- Co-op (explicitly out of scope).

---

## 18. ADR index

Create these as decisions are implemented:

- ADR-001: Deterministic engine + AI intents.
- ADR-002: Electron + loopback server architecture.
- ADR-003: Client-side simulation, server-side persistence and AI.
- ADR-004: 5e-inspired homebrew rules and Focus resource.
- ADR-005: Procedural vs handcrafted world schema.
- ADR-006: Hybrid quest templates + Director.
- ADR-007: SQLite schema and save versioning.
- ADR-008: OpenCode Go provider and session header.
- ADR-009: Content data format and validation.
- ADR-010: PixiJS rendering strategy.

---

## 19. Glossary

- **Intent** — a validated proposal from the AI to change state.
- **Command** — a player or system action submitted to the engine.
- **Event** — an immutable fact produced by a command.
- **Director** — the AI game master that advances story beats and quests.
- **Focus** — universal class ability resource.
- **ScenePacket** — compact context sent to the AI for a turn.
- **World report** — validation result for a generated world.
- **Vertical slice** — the small end-to-end game defined in section 15.

---

## 20. Current status and next action

- Planning: complete.
- Decisions locked: 8/8.
- M0: implemented, tested, packaged; only the live-key acceptance turn remains.
- M1: implemented; procedural and handcrafted worlds generate, validate, render, travel, and save.
- M2: implemented; characters are built, derived, equipped, inspected, rolled, and saved with the campaign.
- M3: implemented; towns, NPC schedules, authored dialogue, merchants, quests, and the crypt are playable and saved.
- M4: vertical slice implemented; initiative, movement, attacks, abilities, enemy AI, retreat, victory rewards, and saved battles work.
- Next: **finish M4 — Battle** (cover, elevation, companions, animations, second E2E battle), then M5.
- Blockers: none.
- Resolved: Electron 45 bundles Node 24.22, so `node:sqlite` works and `better-sqlite3` is unnecessary.
- Resolved: Pixi 8 works under the strict CSP by importing `pixi.js/unsafe-eval`, which installs the non-eval polyfills.
- Live key: the OpenCode Go error path was verified with an intentionally invalid key. A successful turn and real cost report require the user's key in Settings → OpenCode Go.

### M0 implementation notes

- The local Hono server and all of its dependencies are bundled into the Electron main process. `app.asar` is ~4 MB after Pixi and the world worker, and contains only `out/**` and `package.json`.
- The renderer never sees the API key. It receives only the loopback base URL and a per-launch bearer token from the preload bridge.
- AI streaming consumes the SDK `fullStream` and handles `error`/`abort` parts explicitly. This avoids the unhandled `NoOutputGeneratedError` that the SDK's text/usage getters can raise when a provider fails before emitting text.
- Model catalog calls use `Authorization`, `x-opencode-session`, and a custom user agent. Both the catalog and turns share the stable session identifier `iwakura:lab` for now; NPC turns will use `campaign:npc`.
- The SQLite layer uses prepared statements and a small repository layer. Drizzle can be layered on later without changing API contracts.
- The AI Lab, Settings, and packaged app all share the same contracts and renderer code. There is no dev-only mock path in the app.
- `docs/images/` contains captured screenshots of the current shell.
